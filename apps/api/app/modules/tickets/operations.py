import json
import re
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from ...db import q_all, q_one, tx
from ...deps import bad_request, conflict, csrf_protect, forbidden, get_current_user, not_found, require_roles, user_roles
from ...security import new_id, utcnow
from ...workflow import audit, notify
from .service import _add_event, transition_conn

router = APIRouter(tags=["ticket-operations"])


class StateIn(BaseModel):
    status: str
    version: int
    reason: str = Field(min_length=2, max_length=500)


def manageable(conn, tid, actor):
    ticket = q_one("SELECT * FROM tickets WHERE id=?", (tid,), conn)
    if not ticket:
        raise not_found("工单不存在")
    if ticket["assignee_id"] != actor["id"] and not user_roles(actor["id"], conn).intersection({"admin", "dispatcher"}):
        raise forbidden()
    return ticket


@router.post("/staff/tickets/{tid}/state", dependencies=[Depends(csrf_protect)])
def state(tid: str, payload: StateIn, actor=Depends(require_roles("staff", "admin", "dispatcher"))):
    if payload.status not in ("IN_SERVICE", "WAITING_USER", "WAITING_EXTERNAL", "CANCELLED"):
        raise bad_request("请通过维修结果提交与用户验收接口结单")
    with tx() as conn:
        ticket = manageable(conn, tid, actor)
        if ticket["version"] != payload.version:
            raise conflict("工单已更新，请刷新")
        updated = transition_conn(conn, ticket, payload.status, actor_id=actor["id"], detail={"reason": payload.reason})
    return {"id": updated["id"], "status": updated["status"]}


class TransferIn(BaseModel):
    assignee_id: str
    version: int
    reason: str = Field(min_length=2, max_length=500)


@router.post("/staff/tickets/{tid}/transfer-request", dependencies=[Depends(csrf_protect)])
def transfer_request(tid: str, payload: TransferIn, actor=Depends(require_roles("staff", "admin"))):
    with tx() as conn:
        ticket = manageable(conn, tid, actor)
        _add_event(conn, tid, actor["id"], "transfer_requested", detail=payload.model_dump())
        for admin in q_all("SELECT DISTINCT user_id FROM user_roles WHERE role IN ('admin','dispatcher')", (), conn):
            notify(conn, admin["user_id"], "工单转交申请", payload.reason, f"/tickets/{tid}")
    return {"ok": True}


@router.post("/admin/tickets/{tid}/transfer", dependencies=[Depends(csrf_protect)])
def transfer(tid: str, payload: TransferIn, actor=Depends(require_roles("admin", "dispatcher"))):
    with tx() as conn:
        ticket = manageable(conn, tid, actor)
        if ticket["version"] != payload.version or ticket["status"] in ("CLOSED", "CANCELLED"):
            raise conflict("工单状态或版本已变更")
        staff = q_one("SELECT is_active FROM users WHERE id=?", (payload.assignee_id,), conn)
        if not staff or not staff["is_active"] or not user_roles(payload.assignee_id, conn).intersection({"staff", "admin"}):
            raise bad_request("接收人不是可用维修人员")
        conn.execute("UPDATE tickets SET assignee_id=?,version=version+1,updated_at=? WHERE id=?",
                     (payload.assignee_id, utcnow().isoformat(), tid))
        _add_event(conn, tid, actor["id"], "transferred", detail=payload.model_dump())
        notify(conn, payload.assignee_id, "收到转交工单", ticket["title"], f"/tickets/{tid}")
    return {"ok": True}


class CommentIn(BaseModel):
    comment: str = Field(min_length=2, max_length=2000)


@router.post("/tickets/{tid}/comments", dependencies=[Depends(csrf_protect)])
def comment(tid: str, payload: CommentIn, user=Depends(get_current_user)):
    with tx() as conn:
        ticket = q_one("SELECT * FROM tickets WHERE id=? AND owner_id=?", (tid, user["id"]), conn)
        if not ticket:
            raise not_found("工单不存在")
        if ticket["status"] in ("CLOSED", "CANCELLED"):
            raise conflict("该工单已结束")
        _add_event(conn, tid, user["id"], "user_comment", detail=payload.model_dump())
        if ticket["assignee_id"]:
            notify(conn, ticket["assignee_id"], "用户补充资料", payload.comment, f"/tickets/{tid}")
        if ticket["status"] == "WAITING_USER":
            transition_conn(conn, ticket, "IN_SERVICE", actor_id=user["id"], detail={"reason": "用户已补充资料"})
    return {"ok": True}


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=1000)


class AdministrativeCloseIn(BaseModel):
    version: int
    outcome: str = Field(pattern="^(fixed|partially_fixed|unresolved|referred|declined)$")
    reason: str = Field(min_length=5, max_length=500)


@router.post("/admin/tickets/{tid}/administrative-close", dependencies=[Depends(csrf_protect)])
def administrative_close(tid: str, payload: AdministrativeCloseIn, actor=Depends(require_roles("admin", "dispatcher"))):
    with tx() as conn:
        ticket = manageable(conn, tid, actor)
        if ticket["status"] != "AWAITING_VERIFICATION" or ticket["version"] != payload.version:
            raise conflict("仅待验收且版本未变更的工单可行政结单")
        conn.execute("UPDATE tickets SET outcome=?,outcome_confirmed_by_user='no' WHERE id=?", (payload.outcome, tid))
        transition_conn(conn, ticket, "CLOSED", actor_id=actor["id"], detail={"reason": payload.reason, "user_confirmed": False})
        audit(conn, actor["id"], "administrative_close", "ticket", tid, payload.model_dump())
    return {"ok": True, "outcome_confirmed_by_user": "no"}


class CustodyIn(BaseModel):
    appearance: str = Field(min_length=2, max_length=1000)
    accessories: str = Field(default="", max_length=500)
    note: str = Field(default="", max_length=500)


@router.post("/staff/tickets/{tid}/custody", dependencies=[Depends(csrf_protect)])
def custody(tid: str, payload: CustodyIn, actor=Depends(require_roles("staff", "admin"))):
    if re.search(r"密码|password|验证码", payload.note, re.I):
        raise bad_request("设备交接不收集系统密码或验证码")
    with tx() as conn:
        ticket = manageable(conn, tid, actor)
        if ticket["status"] in ("CLOSED", "CANCELLED"):
            raise conflict("该工单已结束")
        _add_event(conn, tid, actor["id"], "device_custody", detail=payload.model_dump())
    return {"ok": True}


@router.post("/tickets/{tid}/custody/confirm", dependencies=[Depends(csrf_protect)])
def custody_confirm(tid: str, actor=Depends(get_current_user)):
    with tx() as conn:
        ticket = q_one("SELECT * FROM tickets WHERE id=? AND owner_id=?", (tid, actor["id"]), conn)
        if not ticket:
            raise not_found("工单不存在")
        if not q_one("SELECT id FROM ticket_events WHERE ticket_id=? AND event_type='device_custody'", (tid,), conn):
            raise conflict("尚无设备交接记录")
        _add_event(conn, tid, actor["id"], "device_return_confirmed")
    return {"ok": True}


@router.post("/tickets/{tid}/review", dependencies=[Depends(csrf_protect)])
def review(tid: str, payload: ReviewIn, user=Depends(get_current_user)):
    with tx() as conn:
        ticket = q_one("SELECT * FROM tickets WHERE id=? AND owner_id=?", (tid, user["id"]), conn)
        if not ticket:
            raise not_found("工单不存在")
        if ticket["status"] != "CLOSED":
            raise conflict("结单后才能评价")
        if q_one("SELECT ticket_id FROM ticket_reviews WHERE ticket_id=?", (tid,), conn):
            raise conflict("该工单已经评价")
        conn.execute("INSERT INTO ticket_reviews VALUES (?,?,?,?,?)", (tid, user["id"], payload.rating, payload.comment, utcnow().isoformat()))
        _add_event(conn, tid, user["id"], "review_submitted", detail={"rating": payload.rating})
    return {"ok": True}


@router.post("/staff/appointments/{aid}/complete", dependencies=[Depends(csrf_protect)])
def finish_visit(aid: str, actor=Depends(require_roles("staff", "admin"))):
    with tx() as conn:
        appt = q_one("SELECT * FROM appointments WHERE id=?", (aid,), conn)
        if not appt:
            raise not_found("预约不存在")
        manageable(conn, appt["ticket_id"], actor)
        if appt["status"] != "CHECKED_IN":
            raise conflict("仅已签到的接诊可以结束")
        conn.execute("UPDATE appointments SET status='COMPLETED',updated_at=? WHERE id=?", (utcnow().isoformat(), aid))
        _add_event(conn, appt["ticket_id"], actor["id"], "visit_completed")
    return {"ok": True}


@router.post("/staff/appointments/{aid}/no-show", dependencies=[Depends(csrf_protect)])
def no_show(aid: str, actor=Depends(require_roles("staff", "admin"))):
    from datetime import datetime, timezone, timedelta
    with tx() as conn:
        appt = q_one("SELECT a.*,s.end_at,e.service_date FROM appointments a JOIN service_slots s ON s.id=a.slot_id "
                     "JOIN service_events e ON e.id=s.event_id WHERE a.id=?", (aid,), conn)
        if not appt:
            raise not_found("预约不存在")
        manageable(conn, appt["ticket_id"], actor)
        end = datetime.fromisoformat(appt["service_date"] + "T" + appt["end_at"]).replace(tzinfo=timezone(timedelta(hours=8)))
        if appt["status"] != "CONFIRMED" or utcnow() < end:
            raise conflict("预约时段结束且确认未到场后才能标记爽约")
        conn.execute("UPDATE appointments SET status='NO_SHOW',checkin_code=NULL,updated_at=? WHERE id=?", (utcnow().isoformat(), aid))
        _add_event(conn, appt["ticket_id"], actor["id"], "no_show")
    return {"ok": True}


class ProposalIn(BaseModel):
    slot_id: str
    reason: str = Field(min_length=2, max_length=500)


@router.post("/admin/tickets/{tid}/appointment-proposals", dependencies=[Depends(csrf_protect)])
def proposal(tid: str, payload: ProposalIn, actor=Depends(require_roles("admin", "dispatcher"))):
    with tx() as conn:
        ticket = manageable(conn, tid, actor)
        from ..scheduling.service import _available_slot
        _available_slot(conn, payload.slot_id)
        pid = new_id("prop")
        conn.execute("INSERT INTO appointment_proposals(id,ticket_id,slot_id,user_id,reason,created_at) VALUES (?,?,?,?,?,?)",
                     (pid, tid, payload.slot_id, ticket["owner_id"], payload.reason, utcnow().isoformat()))
        notify(conn, ticket["owner_id"], "义诊时间建议", payload.reason + "；建议未占用名额，请自行确认。", f"/tickets/{tid}")
        audit(conn, actor["id"], "appointment_proposal", "ticket", tid)
    return {"id": pid}


@router.post("/tickets/{tid}/proposals/{pid}/accept", dependencies=[Depends(csrf_protect)])
def accept_proposal(tid: str, pid: str, user=Depends(get_current_user)):
    proposal = q_one("SELECT * FROM appointment_proposals WHERE id=? AND ticket_id=? AND user_id=?", (pid, tid, user["id"]))
    if not proposal:
        raise not_found("时间建议不存在")
    from ..scheduling.service import create_hold
    from ..scheduling.router import appt_view
    hold = create_hold(user_id=user["id"], slot_id=proposal["slot_id"], ticket_id=tid, idempotency_key=f"proposal:{pid}")
    from ...db import run
    run("UPDATE appointment_proposals SET status='accepted' WHERE id=?", (pid,))
    return appt_view(hold)
