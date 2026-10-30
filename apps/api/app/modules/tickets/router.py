"""工单与维修 API（含管理员派单与运营指标）。"""
import json
from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from ...db import q_all, q_one, run, tx
from ...deps import (bad_request, csrf_protect, forbidden, get_current_user,
                     not_found, require_roles, user_roles)
from ...models import OUTCOMES
from ...deps import require_verified
from ...security import new_id, utcnow
from . import service as svc
from ..scheduling import service as scheduling
from ..scheduling.router import appt_view

router = APIRouter(tags=["tickets"])


class CreateTicketIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    category: str = Field(default="", max_length=50)
    session_id: str | None = None
    device_id: str | None = None
    description: str = Field(default="", max_length=2000)
    handoff_confirmed: bool = False
    idempotency_key: str | None = Field(default=None, max_length=80)


class AssignIn(BaseModel):
    assignee_id: str
    version: int


class RepairRecordIn(BaseModel):
    check_items: str = Field(default="", max_length=2000)
    cause: str = Field(default="", max_length=2000)
    action_taken: str = Field(default="", max_length=2000)
    verification: str = Field(default="", max_length=2000)
    conclusion: str = Field(default="in_progress")
    advice: str = Field(default="", max_length=2000)
    submit_result: bool = False


class VerifyIn(BaseModel):
    fixed: bool
    comment: str = Field(default="", max_length=500)


class ReopenIn(BaseModel):
    reason: str = Field(min_length=2, max_length=500)


def _parse_ticket(t: dict) -> dict:
    t["risk_flags"] = json.loads(t["risk_flags"] or "[]")
    return t


def ticket_view(t: dict, include_detail: bool = False, owner_view: bool = False) -> dict:
    view = {
        "id": t["id"], "title": t["title"], "category": t["category"],
        "priority": t["priority"], "status": t["status"], "outcome": t["outcome"],
        "outcome_confirmed_by_user": t["outcome_confirmed_by_user"],
        "assignee_id": t["assignee_id"], "session_id": t["session_id"],
        "risk_flags": t["risk_flags"], "version": t["version"],
        "created_at": t["created_at"],
        "can_manage": owner_view,
    }
    appt = q_one(
        "SELECT * FROM appointments WHERE ticket_id = ? "
        "AND status IN ('HELD','CONFIRMED','CHECKED_IN') ORDER BY created_at DESC LIMIT 1",
        (t["id"],))
    if appt:
        view["active_appointment"] = appt_view(appt, with_code=owner_view)
        if not owner_view:
            view["active_appointment"].pop("contact_phone", None)
            view["active_appointment"].pop("contact_name", None)
    if include_detail:
        view["review"] = q_one("SELECT rating,comment,created_at FROM ticket_reviews WHERE ticket_id=?", (t["id"],))
        view["proposals"] = q_all("SELECT p.*,s.start_at,s.end_at,e.service_date,e.title AS event_title "
                                  "FROM appointment_proposals p JOIN service_slots s ON s.id=p.slot_id "
                                  "JOIN service_events e ON e.id=s.event_id WHERE p.ticket_id=? AND p.status='pending'", (t["id"],))
        snap = q_one("SELECT * FROM handoff_snapshots WHERE ticket_id = ?", (t["id"],))
        if snap:
            view["handoff"] = {
                "device_desc": snap["device_desc"], "user_description": snap["user_description"],
                "confirmed_facts": json.loads(snap["confirmed_facts"] or "[]"),
                "tried_steps": json.loads(snap["tried_steps"] or "[]"),
                "unconfirmed_items": json.loads(snap["unconfirmed_items"] or "[]"),
                "hypotheses": json.loads(snap["hypotheses"] or "[]"),
                "risk_notes": json.loads(snap["risk_notes"] or "[]"),
                "handoff_reason": snap["handoff_reason"],
            }
        view["events"] = [
            {"type": e["event_type"], "from": e["from_status"], "to": e["to_status"],
             "detail": json.loads(e["detail"] or "{}"), "at": e["created_at"]}
            for e in q_all("SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at",
                           (t["id"],))
        ]
        view["repair_records"] = [
            {"id": r["id"], "check_items": r["check_items"], "cause": r["cause"],
             "action_taken": r["action_taken"], "verification": r["verification"],
             "conclusion": r["conclusion"], "advice": r["advice"],
             "is_result_submission": r["is_result_submission"], "at": r["created_at"]}
            for r in q_all("SELECT * FROM repair_records WHERE ticket_id = ? ORDER BY created_at",
                           (t["id"],))
        ]
    return view


def _get_ticket(ticket_id: str) -> dict:
    t = q_one("SELECT * FROM tickets WHERE id = ?", (ticket_id,))
    if not t:
        raise not_found("工单不存在")
    return _parse_ticket(t)


def _can_view(t: dict, user: dict) -> bool:
    if t["owner_id"] == user["id"] or t["assignee_id"] == user["id"]:
        return True
    return bool(user_roles(user["id"]) & {"admin", "dispatcher"})


@router.post("/tickets", dependencies=[Depends(csrf_protect), Depends(require_verified)])
def create_ticket(payload: CreateTicketIn, user: dict = Depends(get_current_user)):
    t = svc.create_ticket(user=user, payload=payload.model_dump())
    return ticket_view(t, include_detail=True, owner_view=True)


@router.get("/tickets/mine")
def my_tickets(user: dict = Depends(get_current_user)):
    scheduling.expire_holds()
    rows = q_all("SELECT * FROM tickets WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50",
                 (user["id"],))
    return [ticket_view(_parse_ticket(t), owner_view=True) for t in rows]


@router.get("/tickets/{ticket_id}")
def ticket_detail(ticket_id: str, user: dict = Depends(get_current_user)):
    t = _get_ticket(ticket_id)
    if not _can_view(t, user):
        raise forbidden()
    scheduling.expire_holds()
    view = ticket_view(t, include_detail=True, owner_view=t["owner_id"] == user["id"])
    view["can_work"] = t["assignee_id"] == user["id"] or bool(user_roles(user["id"]) & {"admin","dispatcher"})
    return view


@router.post("/tickets/{ticket_id}/cancel", dependencies=[Depends(csrf_protect)])
def cancel_ticket(ticket_id: str, user: dict = Depends(get_current_user)):
    t = _get_ticket(ticket_id)
    if t["owner_id"] != user["id"]:
        raise forbidden()
    t = svc.transition(t, "CANCELLED", actor_id=user["id"], detail={"reason": "用户取消"})
    return ticket_view(t, owner_view=True)


@router.post("/tickets/{ticket_id}/verification", dependencies=[Depends(csrf_protect)])
def verify_result(ticket_id: str, payload: VerifyIn, user: dict = Depends(get_current_user)):
    t = _get_ticket(ticket_id)
    if t["owner_id"] != user["id"]:
        raise forbidden()
    t = svc.submit_verification(t, fixed=payload.fixed, actor_id=user["id"],
                                comment=payload.comment)
    return ticket_view(t, owner_view=True)


@router.post("/tickets/{ticket_id}/reopen", dependencies=[Depends(csrf_protect)])
def reopen_ticket(ticket_id: str, payload: ReopenIn, user: dict = Depends(get_current_user)):
    t = _get_ticket(ticket_id)
    if t["owner_id"] != user["id"]:
        raise forbidden()
    t = svc.reopen(t, actor_id=user["id"], reason=payload.reason)
    return ticket_view(t, owner_view=True)


# ---------- 维修工作台（志愿者 / 管理员） ----------

@router.get("/staff/tickets")
def staff_queue(staff: dict = Depends(require_roles("staff", "admin"))):
    scheduling.expire_holds()
    if "admin" in user_roles(staff["id"]):
        rows = q_all("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 100")
    else:
        rows = q_all("SELECT * FROM tickets WHERE assignee_id=? ORDER BY created_at DESC LIMIT 100",
                     (staff["id"],))
    return [ticket_view(_parse_ticket(t)) for t in rows]


@router.post("/staff/tickets/{ticket_id}/repair-records", dependencies=[Depends(csrf_protect)])
def add_repair_record(ticket_id: str, payload: RepairRecordIn,
                      staff: dict = Depends(require_roles("staff", "admin"))):
    if payload.conclusion not in ("in_progress",) + OUTCOMES:
        raise bad_request("结论枚举非法")
    if payload.submit_result and payload.conclusion == "in_progress":
        raise bad_request("提交维修结果时必须给出结论")
    now = utcnow().isoformat()
    with tx() as conn:
        t = q_one("SELECT * FROM tickets WHERE id=?", (ticket_id,), conn)
        if not t:
            raise not_found("工单不存在")
        if t["assignee_id"] != staff["id"] and "admin" not in user_roles(staff["id"], conn):
            raise forbidden("只能记录分配给自己的工单")
        if t["status"] not in ("ACCEPTED", "IN_SERVICE", "WAITING_USER", "WAITING_EXTERNAL"):
            raise bad_request("当前工单状态不能添加维修记录")
        conn.execute(
            "INSERT INTO repair_records (id, ticket_id, staff_id, check_items, cause, action_taken, "
            "verification, conclusion, advice, is_result_submission, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (new_id("rpr"), ticket_id, staff["id"], payload.check_items,
             payload.cause or "尚未确认", payload.action_taken, payload.verification,
             payload.conclusion, payload.advice,
             "yes" if payload.submit_result else "no", now))
        svc._add_event(conn, ticket_id, staff["id"], "repair_record",
                       detail={"conclusion": payload.conclusion})
        if payload.submit_result:
            svc.transition_conn(conn, t, "AWAITING_VERIFICATION", actor_id=staff["id"],
                                detail={"conclusion": payload.conclusion})
    return ticket_view(_get_ticket(ticket_id), include_detail=True)


# ---------- 管理员 ----------

@router.get("/admin/tickets")
def admin_list(status: str | None = Query(default=None),
               admin: dict = Depends(require_roles("admin", "dispatcher"))):
    scheduling.expire_holds()
    if status:
        rows = q_all("SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC LIMIT 200",
                     (status,))
    else:
        rows = q_all("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 200")
    return [ticket_view(_parse_ticket(t)) for t in rows]


@router.post("/admin/tickets/{ticket_id}/assign", dependencies=[Depends(csrf_protect)])
def admin_assign(ticket_id: str, payload: AssignIn,
                 admin: dict = Depends(require_roles("admin", "dispatcher"))):
    t = svc.assign(ticket_id=ticket_id, assignee_id=payload.assignee_id,
                   expected_version=payload.version, actor_id=admin["id"])
    return ticket_view(t, include_detail=True)


@router.get("/admin/metrics")
def admin_metrics(date_from: date | None = None, date_to: date | None = None,
                  admin: dict = Depends(require_roles("admin", "dispatcher"))):
    if date_from and date_to and date_from > date_to:
        raise bad_request("开始日期不能晚于结束日期")
    return svc.metrics(date_from, date_to)


@router.get("/admin/staff-list")
def staff_list(admin: dict = Depends(require_roles("admin", "dispatcher"))):
    rows = q_all(
        "SELECT u.id, u.display_name FROM users u "
        "JOIN user_roles r ON r.user_id = u.id WHERE r.role = 'staff' AND u.is_active = 1")
    return rows
