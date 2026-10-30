import json
from datetime import date, time
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from ...db import q_all, q_one, tx
from ...deps import bad_request, conflict, not_found, require_roles, csrf_protect, user_roles
from ...security import new_id, utcnow
from ...workflow import audit, notify

router = APIRouter(tags=["operations"])
operator = require_roles("admin", "dispatcher")


class LocationIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    building_room: str = Field(min_length=2, max_length=100)
    address_note: str = Field(default="", max_length=500)
    workstations: int = Field(default=2, ge=1, le=100)


class SlotIn(BaseModel):
    start_at: str
    end_at: str
    capacity: int = Field(default=1, ge=1, le=100)


class EventIn(BaseModel):
    location_id: str
    title: str = Field(min_length=2, max_length=150)
    service_date: date
    service_scope: str = Field(default="", max_length=1000)
    bring_note: str = Field(default="请携带电源适配器并提前备份重要数据", max_length=500)
    slots: list[SlotIn] = Field(min_length=1, max_length=48)


class ShiftIn(BaseModel):
    staff_id: str
    start_at: str
    end_at: str
    skills: list[str] = Field(default_factory=lambda: ["network", "audio", "display", "performance", "app"])


def interval(start, end):
    try:
        begin, finish = time.fromisoformat(start), time.fromisoformat(end)
        if begin >= finish or len(start) != 5 or len(end) != 5:
            raise ValueError()
    except ValueError:
        raise bad_request("时间须为 HH:MM，且结束晚于开始")


@router.get("/admin/scheduling")
def overview(user=Depends(operator)):
    return {"locations": q_all("SELECT * FROM service_locations"),
            "staff": q_all("SELECT DISTINCT u.id,u.display_name FROM users u JOIN user_roles r ON r.user_id=u.id "
                           "WHERE r.role IN ('staff','admin') AND u.is_active=1"),
            "events": [{**e, "slots": q_all("SELECT * FROM service_slots WHERE event_id=? ORDER BY start_at", (e["id"],)),
                        "shifts": q_all("SELECT s.*,u.display_name FROM staff_shifts s JOIN users u ON u.id=s.staff_id WHERE s.event_id=?", (e["id"],))}
                       for e in q_all("SELECT * FROM service_events ORDER BY service_date DESC LIMIT 100")]}


@router.post("/admin/locations", dependencies=[Depends(csrf_protect)])
def create_location(payload: LocationIn, user=Depends(operator)):
    lid = new_id("loc")
    with tx() as conn:
        conn.execute("INSERT INTO service_locations(id,name,building_room,address_note,workstations) VALUES (?,?,?,?,?)",
                     (lid, payload.name, payload.building_room, payload.address_note, payload.workstations))
        audit(conn, user["id"], "location_create", "location", lid)
    return {"id": lid}


@router.post("/admin/service-events", dependencies=[Depends(csrf_protect)])
def create_event(payload: EventIn, user=Depends(operator)):
    for slot in payload.slots:
        interval(slot.start_at, slot.end_at)
    ordered = sorted(payload.slots, key=lambda x: x.start_at)
    if any(a.end_at > b.start_at for a, b in zip(ordered, ordered[1:])):
        raise bad_request("同一活动的时段不能重叠")
    eid = new_id("evt")
    with tx() as conn:
        location = q_one("SELECT * FROM service_locations WHERE id=?", (payload.location_id,), conn)
        if not location:
            raise not_found("场地不存在")
        if any(s.capacity > location["workstations"] for s in ordered):
            raise bad_request("时段容量不能超过工位数")
        conn.execute("INSERT INTO service_events(id,location_id,title,service_date,service_scope,status,bring_note,created_at,managed) "
                     "VALUES (?,?,?,?,?,'draft',?,?,1)", (eid, payload.location_id, payload.title,
                     payload.service_date.isoformat(), payload.service_scope, payload.bring_note, utcnow().isoformat()))
        for slot in ordered:
            conn.execute("INSERT INTO service_slots(id,event_id,start_at,end_at,capacity) VALUES (?,?,?,?,?)",
                         (new_id("slt"), eid, slot.start_at, slot.end_at, slot.capacity))
        audit(conn, user["id"], "event_create", "event", eid)
    return {"id": eid, "status": "draft"}


@router.post("/admin/service-events/{eid}/shifts", dependencies=[Depends(csrf_protect)])
def shift(eid: str, payload: ShiftIn, user=Depends(operator)):
    interval(payload.start_at, payload.end_at)
    with tx() as conn:
        event = q_one("SELECT * FROM service_events WHERE id=?", (eid,), conn)
        if not event:
            raise not_found("活动不存在")
        if event["status"] != "draft":
            raise conflict("已发布活动需先停诊并通知用户，才能调整排班")
        if not user_roles(payload.staff_id, conn).intersection({"staff", "admin"}):
            raise bad_request("排班人员必须是维修志愿者")
        staff = q_one("SELECT is_active FROM users WHERE id=?", (payload.staff_id,), conn)
        if not staff or not staff["is_active"]:
            raise bad_request("该人员账号不可用")
        clash = q_one("SELECT s.id FROM staff_shifts s JOIN service_events e ON e.id=s.event_id "
                      "WHERE s.staff_id=? AND e.service_date=? AND e.status IN ('draft','published') "
                      "AND s.start_at<? AND s.end_at>?", (payload.staff_id, event["service_date"], payload.end_at, payload.start_at), conn)
        if clash:
            raise conflict("该人员已有重叠排班")
        sid = new_id("shf")
        conn.execute("INSERT INTO staff_shifts VALUES (?,?,?,?,?,?)", (
            sid, eid, payload.staff_id, json.dumps(payload.skills), payload.start_at, payload.end_at))
        audit(conn, user["id"], "shift_create", "shift", sid)
    return {"id": sid}


@router.delete("/admin/service-events/{eid}/shifts/{sid}", dependencies=[Depends(csrf_protect)])
def remove_shift(eid: str, sid: str, user=Depends(operator)):
    with tx() as conn:
        event = q_one("SELECT status FROM service_events WHERE id=?", (eid,), conn)
        if not event or event["status"] != "draft":
            raise conflict("仅草稿活动可修改排班")
        conn.execute("DELETE FROM staff_shifts WHERE id=? AND event_id=?", (sid, eid))
        audit(conn, user["id"], "shift_remove", "shift", sid)
    return {"ok": True}


@router.post("/admin/service-events/{eid}/publish", dependencies=[Depends(csrf_protect)])
def publish(eid: str, user=Depends(operator)):
    with tx() as conn:
        event = q_one("SELECT * FROM service_events WHERE id=?", (eid,), conn)
        if not event:
            raise not_found("活动不存在")
        if event["status"] != "draft":
            raise conflict("仅草稿活动可以发布")
        from datetime import timezone, timedelta
        if event["service_date"] < utcnow().astimezone(timezone(timedelta(hours=8))).date().isoformat():
            raise bad_request("不能发布过去的活动")
        location = q_one("SELECT * FROM service_locations WHERE id=?", (event["location_id"],), conn)
        if location["is_open"] != "open":
            raise conflict("场地未开放")
        slots = q_all("SELECT * FROM service_slots WHERE event_id=?", (eid,), conn)
        shifts = q_all("SELECT * FROM staff_shifts WHERE event_id=?", (eid,), conn)
        for slot in slots:
            available = {s["staff_id"] for s in shifts if s["start_at"] <= slot["start_at"] and s["end_at"] >= slot["end_at"]}
            if slot["capacity"] > min(location["workstations"], len(available)):
                raise conflict("时段容量超过工位或完整覆盖该时段的值班人数")
            overlap = q_one("SELECT s.id FROM service_slots s JOIN service_events e ON e.id=s.event_id "
                            "WHERE e.location_id=? AND e.service_date=? AND e.status='published' "
                            "AND e.id<>? AND s.start_at<? AND s.end_at>?", (event["location_id"], event["service_date"],
                            eid, slot["end_at"], slot["start_at"]), conn)
            if overlap:
                raise conflict("同一场地已有重叠活动，不能重复贡献工位")
        conn.execute("UPDATE service_events SET status='published',managed=1 WHERE id=?", (eid,))
        audit(conn, user["id"], "event_publish", "event", eid)
    return {"ok": True}


class ReasonIn(BaseModel):
    reason: str = Field(min_length=2, max_length=500)


@router.post("/admin/service-events/{eid}/cancel", dependencies=[Depends(csrf_protect)])
def cancel(eid: str, payload: ReasonIn, user=Depends(operator)):
    with tx() as conn:
        event = q_one("SELECT * FROM service_events WHERE id=?", (eid,), conn)
        if not event:
            raise not_found("活动不存在")
        affected = q_all("SELECT a.* FROM appointments a JOIN service_slots s ON s.id=a.slot_id "
                         "WHERE s.event_id=? AND a.status IN ('HELD','CONFIRMED')", (eid,), conn)
        for a in affected:
            column = "held_count" if a["status"] == "HELD" else "confirmed_count"
            conn.execute(f"UPDATE service_slots SET {column}=MAX(0,{column}-1) WHERE id=?", (a["slot_id"],))
            conn.execute("UPDATE appointments SET status='CANCELLED',checkin_code=NULL,updated_at=? WHERE id=?", (utcnow().isoformat(), a["id"]))
            from ..tickets.service import _add_event
            _add_event(conn, a["ticket_id"], user["id"], "event_cancelled", detail={"reason": payload.reason})
            notify(conn, a["user_id"], "义诊活动停诊", payload.reason + "，请重新预约或等待协调。", f"/tickets/{a['ticket_id']}")
        conn.execute("UPDATE service_events SET status='cancelled' WHERE id=?", (eid,))
        audit(conn, user["id"], "event_cancel", "event", eid, payload.model_dump())
    return {"ok": True, "affected_appointments": len(affected)}


@router.post("/admin/service-events/{eid}/reopen", dependencies=[Depends(csrf_protect)])
def reopen(eid: str, user=Depends(operator)):
    with tx() as conn:
        event = q_one("SELECT status FROM service_events WHERE id=?", (eid,), conn)
        if not event or event["status"] != "cancelled":
            raise conflict("仅已停诊活动可以恢复为草稿")
        conn.execute("UPDATE service_events SET status='draft' WHERE id=?", (eid,))
        audit(conn, user["id"], "event_reopen", "event", eid)
    return {"ok": True}
