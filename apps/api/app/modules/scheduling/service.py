"""预约与名额事务（方案 10.3 / 10.4，SQLite 实现）。

一致性策略：
- 所有名额变更在 BEGIN IMMEDIATE 事务内执行（SQLite 单写锁串行化）；
- 计数变更使用原子条件 UPDATE（可平滑迁移 PostgreSQL 的等价实现）；
- 幂等键唯一约束防止网络重试产生重复预约；
- 临时保留 5 分钟过期，过期在每次占用计算前惰性回收；
- 缓存不参与容量事实。
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from ...db import q_all, q_one, tx
from ...deps import bad_request, conflict, forbidden, not_found, user_roles
from ...security import hold_expiry, new_checkin_code, new_id, utcnow
from ...workflow import notify

HOLD_MINUTES = 5
ACTIVE_APPT = ("HELD", "CONFIRMED", "CHECKED_IN")


def _available_slot(conn, slot_id: str) -> dict:
    slot = _get_slot(conn, slot_id)
    event = q_one(
        "SELECT e.*, l.is_open FROM service_events e JOIN service_locations l "
        "ON l.id=e.location_id WHERE e.id=?", (slot["event_id"],), conn)
    if not event or event["status"] != "published" or event["is_open"] != "open":
        raise conflict("活动或服务点未开放，请选择其他时段")
    start = datetime.fromisoformat(f"{event['service_date']}T{slot['start_at']}").replace(
        tzinfo=timezone(timedelta(hours=8)))
    if start <= utcnow():
        raise conflict("该时段已开始，请选择其他时段")
    if event.get("managed"):
        staff = q_all("SELECT DISTINCT s.staff_id FROM staff_shifts s JOIN users u ON u.id=s.staff_id "
                      "JOIN user_roles r ON r.user_id=u.id WHERE r.role IN ('staff','admin') AND "
                      "s.event_id=? AND s.start_at<=? AND s.end_at>=? AND u.is_active=1",
                      (event["id"], slot["start_at"], slot["end_at"]), conn)
        if len(staff) < slot["capacity"]:
            raise conflict("当前时段值班人员不足，请等待调度员协调")
    return slot


def _bookable_ticket(conn, ticket_id: str, user_id: str) -> dict:
    ticket = q_one("SELECT * FROM tickets WHERE id=?", (ticket_id,), conn)
    if not ticket or ticket["owner_id"] != user_id:
        raise not_found("工单不存在")
    if ticket["status"] not in ("OPEN", "ACCEPTED", "WAITING_EXTERNAL"):
        raise conflict("当前工单状态不能预约或改期")
    return ticket


def _check_user_overlap(conn, user_id, slot_id, exclude_id=""):
    slot = _get_slot(conn, slot_id)
    event = q_one("SELECT service_date FROM service_events WHERE id=?", (slot["event_id"],), conn)
    clash = q_one("SELECT a.id FROM appointments a JOIN service_slots s ON s.id=a.slot_id "
                  "JOIN service_events e ON e.id=s.event_id WHERE a.user_id=? AND a.id<>? "
                  "AND a.status IN ('HELD','CONFIRMED','CHECKED_IN') AND e.service_date=? "
                  "AND s.start_at<? AND s.end_at>?", (user_id, exclude_id, event["service_date"], slot["end_at"], slot["start_at"]), conn)
    if clash:
        raise conflict("你在该时间已有其他预约，请选择不重叠的时段")


def expire_holds() -> None:
    """独立提交回收，避免后续业务拒绝导致回收事务一起回滚。"""
    with tx() as conn:
        for slot in q_all("SELECT * FROM service_slots WHERE held_count > 0", (), conn):
            _expire_holds(conn, slot)


def _get_slot(conn, slot_id: str) -> dict:
    slot = q_one("SELECT * FROM service_slots WHERE id = ?", (slot_id,), conn)
    if not slot:
        raise not_found("时段不存在")
    return slot


def _expire_holds(conn, slot: dict) -> None:
    """回收过期保留。必须在事务内调用。"""
    now = utcnow().isoformat()
    expired = q_all(
        "SELECT id FROM appointments WHERE slot_id = ? AND status = 'HELD' AND hold_expires_at <= ?",
        (slot["id"], now), conn)
    for a in expired:
        conn.execute("UPDATE appointments SET status = 'EXPIRED', updated_at = ? WHERE id = ?",
                     (now, a["id"]))
    if expired:
        conn.execute("UPDATE service_slots SET held_count = MAX(0, held_count - ?) WHERE id = ?",
                     (len(expired), slot["id"]))
        slot["held_count"] = max(0, slot["held_count"] - len(expired))


def _remaining(slot: dict) -> int:
    return slot["capacity"] - slot["confirmed_count"] - slot["held_count"]


def list_events(date_from: str | None = None) -> list[dict]:
    sql = ("SELECT e.*, l.name AS loc_name, l.building_room, l.address_note, l.is_open "
           "FROM service_events e JOIN service_locations l ON l.id = e.location_id "
           "WHERE e.status = 'published'")
    today = utcnow().astimezone(timezone(timedelta(hours=8))).date().isoformat()
    sql += " AND e.service_date >= ?"
    params: list = [max(date_from or today, today)]
    rows = q_all(sql + " ORDER BY e.service_date LIMIT 30", tuple(params))
    return [
        {"id": e["id"], "title": e["title"], "service_date": e["service_date"],
         "service_scope": e["service_scope"], "bring_note": e["bring_note"],
         "location": {"name": e["loc_name"], "building_room": e["building_room"],
                      "address_note": e["address_note"]}}
        for e in rows if e["is_open"] == "open"
    ]


def list_slots(event_id: str) -> list[dict]:
    event = q_one("SELECT e.*, l.is_open FROM service_events e JOIN service_locations l "
                  "ON l.id=e.location_id WHERE e.id=?", (event_id,))
    if not event or event["status"] != "published" or event["is_open"] != "open":
        raise not_found("活动不存在或未开放")
    with tx() as conn:
        slots = q_all("SELECT * FROM service_slots WHERE event_id = ? ORDER BY start_at",
                      (event_id,), conn)
        out = []
        for s in slots:
            _expire_holds(conn, s)
            start = datetime.fromisoformat(f"{event['service_date']}T{s['start_at']}").replace(
                tzinfo=timezone(timedelta(hours=8)))
            if start <= utcnow():
                continue
            out.append({"id": s["id"], "start_at": s["start_at"], "end_at": s["end_at"],
                        "capacity": s["capacity"], "remaining": _remaining(s)})
    return out


def create_hold(*, user_id: str, slot_id: str, ticket_id: str,
                idempotency_key: str | None) -> dict:
    expire_holds()
    with tx() as conn:
        _bookable_ticket(conn, ticket_id, user_id)
        if idempotency_key:
            dup = q_one("SELECT * FROM appointments WHERE idempotency_key=?", (idempotency_key,), conn)
            if dup:
                if (dup["user_id"], dup["ticket_id"], dup["slot_id"]) != (user_id, ticket_id, slot_id):
                    raise conflict("幂等键已用于其他请求")
                return dup
        slot = _available_slot(conn, slot_id)
        _check_user_overlap(conn, user_id, slot_id)
        _expire_holds(conn, slot)

        # 同一工单不允许同时存在多个有效预约/保留
        active = q_one(
            "SELECT id FROM appointments WHERE ticket_id = ? AND status IN ('HELD','CONFIRMED','CHECKED_IN')",
            (ticket_id,), conn)
        if active:
            raise conflict("该工单已有进行中的预约，请先改期或取消")

        # 原子条件占用：容量 - 已确认 - 未过期保留 > 0 才递增 held_count
        cur = conn.execute(
            "UPDATE service_slots SET held_count = held_count + 1 "
            "WHERE id = ? AND capacity - confirmed_count - held_count > 0",
            (slot_id,))
        if cur.rowcount == 0:
            raise conflict("该时段名额已满，请选择其他时段")

        appt_id = new_id("apt")
        now = utcnow().isoformat()
        conn.execute(
            "INSERT INTO appointments (id, ticket_id, slot_id, user_id, status, hold_expires_at, "
            "idempotency_key, created_at, updated_at) VALUES (?,?,?,?,'HELD',?,?,?,?)",
            (appt_id, ticket_id, slot_id, user_id,
             hold_expiry(HOLD_MINUTES).isoformat(), idempotency_key, now, now))
        conn.execute(
            "INSERT INTO ticket_events (id, ticket_id, actor_id, event_type, detail, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (new_id("tev"), ticket_id, user_id, "slot_held",
             json.dumps({"slot_id": slot_id}), now))
        return q_one("SELECT * FROM appointments WHERE id = ?", (appt_id,), conn)


def confirm_booking(*, user_id: str, appointment_id: str,
                    contact_name: str, contact_phone: str,
                    idempotency_key: str | None) -> dict:
    expire_holds()
    with tx() as conn:
        appt = q_one("SELECT * FROM appointments WHERE id = ?", (appointment_id,), conn)
        if not appt or appt["user_id"] != user_id:
            raise not_found("预约不存在")
        if appt["status"] == "CONFIRMED":
            return appt  # 幂等：重复确认直接返回
        if appt["status"] != "HELD":
            raise conflict(f"当前状态（{appt['status']}）不能确认预约")
        _bookable_ticket(conn, appt["ticket_id"], user_id)
        _available_slot(conn, appt["slot_id"])
        if appt["hold_expires_at"] and appt["hold_expires_at"] <= utcnow().isoformat():
            raise conflict("保留已过期，请重新选择时段")

        cur = conn.execute(
            "UPDATE service_slots SET held_count = held_count - 1, confirmed_count = confirmed_count + 1 "
            "WHERE id = ? AND held_count > 0",
            (appt["slot_id"],))
        if cur.rowcount == 0:
            raise conflict("名额状态异常，请重试")

        now = utcnow().isoformat()
        code = new_checkin_code()
        conn.execute(
            "UPDATE appointments SET status='CONFIRMED', contact_name=?, contact_phone=?, "
            "checkin_code=?, updated_at=? WHERE id=?",
            (contact_name, contact_phone, code, now, appointment_id))
        conn.execute(
            "INSERT INTO ticket_events (id, ticket_id, actor_id, event_type, detail, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (new_id("tev"), appt["ticket_id"], user_id, "appointment_confirmed",
             json.dumps({"appointment_id": appointment_id}), now))
        notify(conn, user_id, "预约已确认", "请查看到场时间、地点与签到码。", f"/tickets/{appt['ticket_id']}")
        return q_one("SELECT * FROM appointments WHERE id = ?", (appointment_id,), conn)


def cancel_appointment(*, user_id: str, appointment_id: str,
                       is_staff: bool = False, reason: str = "") -> dict:
    with tx() as conn:
        appt = q_one("SELECT * FROM appointments WHERE id = ?", (appointment_id,), conn)
        if not appt or (appt["user_id"] != user_id and not is_staff):
            raise not_found("预约不存在")
        if appt["status"] == "CANCELLED":
            return appt
        if appt["status"] not in ("HELD", "CONFIRMED"):
            raise conflict(f"当前状态（{appt['status']}）不能取消")

        if appt["status"] == "HELD":
            conn.execute("UPDATE service_slots SET held_count = MAX(0, held_count - 1) WHERE id = ?",
                         (appt["slot_id"],))
        else:
            conn.execute(
                "UPDATE service_slots SET confirmed_count = MAX(0, confirmed_count - 1) WHERE id = ?",
                (appt["slot_id"],))
        prev = appt["status"]
        now = utcnow().isoformat()
        conn.execute("UPDATE appointments SET status='CANCELLED', updated_at=? WHERE id=?",
                     (now, appointment_id))
        conn.execute(
            "INSERT INTO ticket_events (id, ticket_id, actor_id, event_type, detail, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (new_id("tev"), appt["ticket_id"], user_id, "appointment_cancelled",
             json.dumps({"appointment_id": appointment_id, "from": prev, "reason": reason}), now))
        notify(conn, appt["user_id"], "预约已取消", reason or "名额已释放，工单和历史仍会保留。", f"/tickets/{appt['ticket_id']}")
        return q_one("SELECT * FROM appointments WHERE id = ?", (appointment_id,), conn)


def reschedule(*, user_id: str, appointment_id: str, new_slot_id: str,
               idempotency_key: str | None) -> dict:
    """改期：同一事务内先获得新名额，成功后才释放旧名额；失败保留原预约。"""
    expire_holds()
    with tx() as conn:
        appt = q_one("SELECT * FROM appointments WHERE id = ?", (appointment_id,), conn)
        if not appt or appt["user_id"] != user_id:
            raise not_found("预约不存在")
        if idempotency_key:
            previous = q_one("SELECT * FROM scheduling_requests WHERE idempotency_key=?",
                             (idempotency_key,), conn)
            if previous:
                if (previous["user_id"], previous["appointment_id"], previous["new_slot_id"]) != (
                        user_id, appointment_id, new_slot_id):
                    raise conflict("幂等键已用于其他请求")
                if appt["status"] != "CONFIRMED" or appt["slot_id"] != new_slot_id:
                    raise conflict("此改期请求已处理，预约已再次变更，请刷新查看最新安排")
                return appt
        if appt["status"] != "CONFIRMED":
            raise conflict("仅已确认的预约可以改期")
        _bookable_ticket(conn, appt["ticket_id"], user_id)
        if appt["slot_id"] == new_slot_id:
            raise bad_request("新时段与当前时段相同")

        new_slot = _available_slot(conn, new_slot_id)
        _check_user_overlap(conn, user_id, new_slot_id, appointment_id)
        _expire_holds(conn, new_slot)

        cur = conn.execute(
            "UPDATE service_slots SET confirmed_count = confirmed_count + 1 "
            "WHERE id = ? AND capacity - confirmed_count - held_count > 0",
            (new_slot_id,))
        if cur.rowcount == 0:
            raise conflict("新时段名额已满，原预约仍然有效")

        conn.execute(
            "UPDATE service_slots SET confirmed_count = MAX(0, confirmed_count - 1) WHERE id = ?",
            (appt["slot_id"],))
        conn.execute("UPDATE appointments SET slot_id=?, updated_at=? WHERE id=?",
                     (new_slot_id, utcnow().isoformat(), appointment_id))
        conn.execute(
            "INSERT INTO ticket_events (id, ticket_id, actor_id, event_type, detail, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (new_id("tev"), appt["ticket_id"], user_id, "appointment_rescheduled",
             json.dumps({"appointment_id": appointment_id, "new_slot_id": new_slot_id}),
             utcnow().isoformat()))
        if idempotency_key:
            conn.execute("INSERT INTO scheduling_requests VALUES (?,?,?,?)",
                         (idempotency_key, user_id, appointment_id, new_slot_id))
        notify(conn, user_id, "预约改期成功", "请查看最新服务地点与时段。", f"/tickets/{appt['ticket_id']}")
        return q_one("SELECT * FROM appointments WHERE id = ?", (appointment_id,), conn)


def check_in(*, staff_id: str, appointment_id: str, code: str) -> dict:
    with tx() as conn:
        appt = q_one("SELECT * FROM appointments WHERE id = ?", (appointment_id,), conn)
        if not appt:
            raise not_found("预约不存在")
        ticket = q_one("SELECT * FROM tickets WHERE id=?", (appt["ticket_id"],), conn)
        if "admin" not in user_roles(staff_id, conn) and (
                "staff" not in user_roles(staff_id, conn) or ticket["assignee_id"] != staff_id):
            raise forbidden("只能为分配给自己的工单签到")
        if ticket["status"] not in ("OPEN", "ACCEPTED"):
            raise conflict("当前工单状态不能签到")
        if appt["status"] != "CONFIRMED":
            raise conflict(f"当前状态（{appt['status']}）不能签到")
        if not code or appt["checkin_code"] != code:
            raise bad_request("签到码不正确")
        now = utcnow().isoformat()
        conn.execute("UPDATE appointments SET status='CHECKED_IN', checkin_code=NULL, updated_at=? "
                     "WHERE id=?", (now, appointment_id))
        ticket = q_one("SELECT * FROM tickets WHERE id = ?", (appt["ticket_id"],), conn)
        if ticket and ticket["status"] in ("OPEN", "ACCEPTED"):
            conn.execute(
                "UPDATE tickets SET status='IN_SERVICE', assignee_id=?, version=version+1, "
                "updated_at=? WHERE id=?",
                (ticket["assignee_id"] or staff_id, now, ticket["id"]))
            conn.execute(
                "INSERT INTO ticket_events (id, ticket_id, actor_id, event_type, from_status, "
                "to_status, detail, created_at) VALUES (?,?,?,?,?,?,?,?)",
                (new_id("tev"), ticket["id"], staff_id, "check_in", ticket["status"],
                 "IN_SERVICE", json.dumps({"appointment_id": appointment_id}), now))
        return q_one("SELECT * FROM appointments WHERE id = ?", (appointment_id,), conn)
