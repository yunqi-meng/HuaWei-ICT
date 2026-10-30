"""工单服务：状态机、交接快照、验收、派单、指标（SQLite 实现）。"""
from __future__ import annotations

import json

from ...db import q_all, q_one, tx
from ...deps import bad_request, conflict, not_found
from ...models import ALLOWED_TRANSITIONS, OUTCOMES
from ...security import new_id, utcnow
from ..diagnosis import engine as diag
from ...workflow import notify


def _add_event(conn, ticket_id: str, actor_id: str | None, event_type: str,
               from_status: str = "", to_status: str = "", detail: dict | None = None) -> None:
    conn.execute(
        "INSERT INTO ticket_events (id, ticket_id, actor_id, event_type, from_status, to_status, "
        "detail, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (new_id("tev"), ticket_id, actor_id, event_type, from_status, to_status,
         json.dumps(detail or {}, ensure_ascii=False), utcnow().isoformat()))
    ticket = q_one("SELECT owner_id,title FROM tickets WHERE id=?", (ticket_id,), conn)
    if ticket and event_type == "assigned" and (detail or {}).get("assignee_id"):
        notify(conn, detail["assignee_id"], "收到新工单", ticket["title"], f"/tickets/{ticket_id}")
    if ticket and event_type not in ("repair_record", "created", "user_comment"):
        labels = {"assigned": "工单已分配", "status_change": "工单进度更新", "reopened": "工单已复开",
                  "appointment_cancelled": "预约已取消", "transferred": "工单已转交", "visit_completed": "本次接诊已结束"}
        notify(conn, ticket["owner_id"], labels.get(event_type, "工单有新进展"),
               (detail or {}).get("reason") or ticket["title"], f"/tickets/{ticket_id}")


def transition_conn(conn, ticket: dict, to_status: str, *, actor_id: str,
                    detail: dict | None = None) -> dict:
    fresh = q_one("SELECT * FROM tickets WHERE id=?", (ticket["id"],), conn)
    if not fresh or fresh["version"] != ticket["version"]:
        raise conflict("工单已被他人修改，请刷新后重试")
    ticket = fresh
    allowed = ALLOWED_TRANSITIONS.get(ticket["status"], set())
    if to_status not in allowed:
        raise conflict(f"工单当前状态（{ticket['status']}）不允许变更为 {to_status}")
    prev = ticket["status"]
    if to_status in ("CANCELLED", "CLOSED"):
        appointments = q_all("SELECT * FROM appointments WHERE ticket_id=? AND status IN ('HELD','CONFIRMED')",
                             (ticket["id"],), conn)
        for appt in appointments:
            column = "held_count" if appt["status"] == "HELD" else "confirmed_count"
            conn.execute(f"UPDATE service_slots SET {column}=MAX(0,{column}-1) WHERE id=?",
                         (appt["slot_id"],))
            conn.execute("UPDATE appointments SET status='CANCELLED', checkin_code=NULL, updated_at=? WHERE id=?",
                         (utcnow().isoformat(), appt["id"]))
            _add_event(conn, ticket["id"], actor_id, "appointment_cancelled",
                       detail={"appointment_id": appt["id"], "reason": "工单已结束，释放未接诊预约"})
        if to_status == "CANCELLED":
            conn.execute("UPDATE appointments SET status='CANCELLED', updated_at=? "
                         "WHERE ticket_id=? AND status='CHECKED_IN'", (utcnow().isoformat(), ticket["id"]))
    if to_status == "CLOSED":
        conn.execute("UPDATE appointments SET status='COMPLETED', updated_at=? "
                     "WHERE ticket_id=? AND status='CHECKED_IN'", (utcnow().isoformat(), ticket["id"]))
    conn.execute(
        "UPDATE tickets SET status=?, version=version+1, updated_at=? WHERE id=?",
        (to_status, utcnow().isoformat(), ticket["id"]))
    _add_event(conn, ticket["id"], actor_id, "status_change", prev, to_status, detail)
    ticket = q_one("SELECT * FROM tickets WHERE id=?", (ticket["id"],), conn)
    ticket["risk_flags"] = json.loads(ticket["risk_flags"] or "[]")
    return ticket


def transition(ticket: dict, to_status: str, *, actor_id: str,
               detail: dict | None = None) -> dict:
    with tx() as conn:
        return transition_conn(conn, ticket, to_status, actor_id=actor_id, detail=detail)


def create_ticket(*, user: dict, payload: dict) -> dict:
    idem = payload.get("idempotency_key")
    with tx() as conn:
        if idem:
            dup = q_one("SELECT * FROM tickets WHERE idempotency_key=?", (idem,), conn)
            if dup:
                if (dup["owner_id"], dup["title"], dup["session_id"], dup["device_id"]) != (
                        user["id"], payload["title"], payload.get("session_id"), payload.get("device_id")):
                    raise conflict("幂等键已用于其他请求")
                dup["risk_flags"] = json.loads(dup["risk_flags"] or "[]")
                return dup
        session = None
        if payload.get("session_id"):
            session = diag.get_session(payload["session_id"], conn)
            if not session or session["user_id"] != user["id"]:
                raise not_found("会话不存在")
            if not payload.get("handoff_confirmed"):
                raise bad_request("请先确认排障交接摘要")
            active = q_one("SELECT * FROM tickets WHERE session_id=? AND owner_id=? AND status NOT IN ('CLOSED','CANCELLED') ORDER BY created_at DESC LIMIT 1",
                           (session["id"], user["id"]), conn)
            if active:
                active["risk_flags"] = json.loads(active["risk_flags"] or "[]")
                return active
        if payload.get("device_id"):
            dev = q_one("SELECT * FROM devices WHERE id = ?", (payload["device_id"],), conn)
            if not dev or dev["owner_id"] != user["id"]:
                raise not_found("设备不存在")

        tid = new_id("tkt")
        now = utcnow().isoformat()
        risk_flags = session["risk_flags"] if session else diag.detect_risk(payload["title"] + " " + (payload.get("description") or ""))
        conn.execute(
            "INSERT INTO tickets (id, owner_id, session_id, device_id, title, category, priority, "
            "status, risk_flags, idempotency_key, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,'OPEN',?,?,?,?)",
            (tid, user["id"], payload.get("session_id"), payload.get("device_id"),
             payload["title"],
             payload.get("category") or (session["symptom_category"] if session else ""),
             "high" if risk_flags else "normal",
             json.dumps(risk_flags, ensure_ascii=False), idem, now, now))

        if session:
            draft = diag.build_handoff_draft(session)
            conn.execute(
                "INSERT INTO handoff_snapshots (id, ticket_id, device_desc, user_description, "
                "confirmed_facts, tried_steps, unconfirmed_items, hypotheses, risk_notes, "
                "handoff_reason, confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (new_id("hdf"), tid, draft["device_desc"],
                 payload.get("description") or draft["user_description"],
                 json.dumps(draft["confirmed_facts"], ensure_ascii=False),
                 json.dumps(draft["tried_steps"], ensure_ascii=False),
                 json.dumps(draft["unconfirmed_items"], ensure_ascii=False),
                 json.dumps(draft["hypotheses"], ensure_ascii=False),
                 json.dumps(draft["risk_notes"], ensure_ascii=False),
                 draft["handoff_reason"], now))
            if session["state"] != "RESOLVED":
                conn.execute(
                    "UPDATE diagnosis_sessions SET state='HANDOFF', end_reason='handoff', "
                    "updated_at=? WHERE id=?", (now, session["id"]))
            conn.execute("UPDATE attachments SET ticket_id=? WHERE session_id=? AND ticket_id IS NULL", (tid, session["id"]))
        else:
            device_desc = "未提供设备信息"
            if payload.get("device_id"):
                device_desc = " / ".join(filter(None, (dev["brand_model"], dev["os_version"])))
            conn.execute(
                "INSERT INTO handoff_snapshots (id,ticket_id,device_desc,user_description,"
                "unconfirmed_items,handoff_reason,confirmed_at) VALUES (?,?,?,?,?,?,?)",
                (new_id("hdf"), tid, device_desc, payload.get("description") or payload["title"],
                 json.dumps(["未经线上排障，需现场确认故障现象与设备环境"], ensure_ascii=False),
                 "用户直接申请人工服务", now))

        _add_event(conn, tid, user["id"], "created", "", "OPEN",
                   {"from_session": bool(session)})
        ticket = q_one("SELECT * FROM tickets WHERE id=?", (tid,), conn)
        ticket["risk_flags"] = json.loads(ticket["risk_flags"] or "[]")
        return ticket


def assign(*, ticket_id: str, assignee_id: str, expected_version: int, actor_id: str) -> dict:
    with tx() as conn:
        ticket = q_one("SELECT * FROM tickets WHERE id=?", (ticket_id,), conn)
        if not ticket:
            raise not_found("工单不存在")
        if ticket["version"] != expected_version:
            raise conflict("工单已被他人修改，请刷新后重试")  # 乐观锁（方案 12.2）
        assignee = q_one("SELECT * FROM users WHERE id=?", (assignee_id,), conn)
        if not assignee:
            raise not_found("被指派人不存在")
        roles = {r["role"] for r in q_all("SELECT role FROM user_roles WHERE user_id=?",
                                          (assignee_id,), conn)}
        if "staff" not in roles and "admin" not in roles:
            raise bad_request("被指派人不是维修志愿者")
        conn.execute("UPDATE tickets SET assignee_id=? WHERE id=?", (assignee_id, ticket_id))
        _add_event(conn, ticket_id, actor_id, "assigned", detail={"assignee_id": assignee_id})
        ticket = q_one("SELECT * FROM tickets WHERE id=?", (ticket_id,), conn)
        ticket["risk_flags"] = json.loads(ticket["risk_flags"] or "[]")
        return transition_conn(conn, ticket, "ACCEPTED", actor_id=actor_id,
                               detail={"assignee_id": assignee_id})


def submit_verification(ticket: dict, *, fixed: bool, actor_id: str, comment: str = "") -> dict:
    with tx() as conn:
        fresh = q_one("SELECT * FROM tickets WHERE id=?", (ticket["id"],), conn)
        if fresh["status"] != "AWAITING_VERIFICATION":
            raise conflict("当前工单不在待验收状态")
        if fixed:
            last = q_one(
                "SELECT detail FROM ticket_events WHERE ticket_id=? AND event_type='status_change' "
                "AND to_status='AWAITING_VERIFICATION' ORDER BY created_at DESC LIMIT 1",
                (fresh["id"],), conn)
            outcome = "unresolved"
            if last:
                c = (json.loads(last["detail"] or "{}")).get("conclusion")
                if c in OUTCOMES:
                    outcome = c
            conn.execute(
                "UPDATE tickets SET outcome=?, outcome_confirmed_by_user='yes' WHERE id=?",
                (outcome, fresh["id"]))
            fresh["risk_flags"] = json.loads(fresh["risk_flags"] or "[]")
            return transition_conn(conn, fresh, "CLOSED", actor_id=actor_id,
                                   detail={"verification": "user_confirmed", "comment": comment})
        _add_event(conn, fresh["id"], actor_id, "verification_failed",
                   detail={"comment": comment})
        fresh["risk_flags"] = json.loads(fresh["risk_flags"] or "[]")
        return transition_conn(conn, fresh, "IN_SERVICE", actor_id=actor_id,
                               detail={"verification": "user_rejected", "comment": comment})


def reopen(ticket: dict, *, actor_id: str, reason: str) -> dict:
    """复开：仅允许已结单工单，生成事件并保留原验收信息。"""
    with tx() as conn:
        fresh = q_one("SELECT * FROM tickets WHERE id=?", (ticket["id"],), conn)
        if fresh["status"] != "CLOSED":
            raise conflict("仅已结单的工单可以申请复开")
        conn.execute(
            "UPDATE tickets SET status='OPEN', outcome=NULL, outcome_confirmed_by_user='no', "
            "assignee_id=NULL, version=version+1, updated_at=? WHERE id=?",
            (utcnow().isoformat(), fresh["id"]))
        _add_event(conn, fresh["id"], actor_id, "reopened", detail={"reason": reason})
        fresh = q_one("SELECT * FROM tickets WHERE id=?", (ticket["id"],), conn)
        fresh["risk_flags"] = json.loads(fresh["risk_flags"] or "[]")
        return fresh


def metrics(date_from=None, date_to=None) -> dict:
    from datetime import datetime, timedelta, timezone
    from ...config import get_settings
    conditions, params = [], []
    for value, op, extra in ((date_from, ">=", 0), (date_to, "<", 1)):
        if value:
            moment = datetime.fromisoformat(str(value)).replace(tzinfo=timezone(timedelta(hours=8))) + timedelta(days=extra)
            conditions.append(f"created_at {op} ?")
            params.append(moment.astimezone(timezone.utc).isoformat())
    filters = " AND " + " AND ".join(conditions) if conditions else ""
    def count(status: str) -> int:
        return q_one("SELECT COUNT(*) AS n FROM tickets WHERE status=?" + filters, (status, *params))["n"]

    by_status = {s: count(s) for s in ALLOWED_TRANSITIONS}
    resolved = q_one(
        "SELECT COUNT(*) AS n FROM tickets WHERE outcome='fixed' AND outcome_confirmed_by_user='yes'" + filters, tuple(params))["n"]
    handoff_sessions = q_one(
        "SELECT COUNT(*) AS n FROM diagnosis_sessions WHERE state='HANDOFF'" + filters, tuple(params))["n"]
    resolved_sessions = q_one(
        "SELECT COUNT(*) AS n FROM diagnosis_sessions WHERE state='RESOLVED'" + filters, tuple(params))["n"]
    return {
        "tickets_by_status": by_status,
        "tickets_fixed_user_confirmed": resolved,
        "sessions_handoff": handoff_sessions,
        "sessions_resolved": resolved_sessions,
        "date_from": str(date_from) if date_from else None, "date_to": str(date_to) if date_to else None,
        "environment": get_settings().app_env,
        "sessions_total": q_one("SELECT COUNT(*) AS n FROM diagnosis_sessions WHERE 1=1" + filters, tuple(params))["n"],
        "reviews": q_one("SELECT COUNT(*) AS n,AVG(rating) AS average FROM ticket_reviews WHERE 1=1" + filters, tuple(params)),
        "note": "统计口径：按创建时间、北京时间日期范围统计。开发环境可能含演示/测试数据；已结单不等于已修好，仅 outcome=fixed 且用户确认计入修复数。",
    }
