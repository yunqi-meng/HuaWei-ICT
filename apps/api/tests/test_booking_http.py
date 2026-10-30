"""预约恢复、权限与事务回归。HTTP 使用 ASGI TestClient，无需监听端口。"""
import concurrent.futures
import unittest
import logging
from datetime import timedelta
from uuid import uuid4

from helpers import make_ticket, make_user
from fastapi.testclient import TestClient

from app.db import q_one, run, tx
from app.deps import ApiError
from app.main import app
from app.modules.scheduling import service as scheduling
from app.modules.tickets import service as tickets
from app.security import new_csrf_token, new_id, new_session_token, utcnow

logging.getLogger("httpx").setLevel(logging.WARNING)


class TestBookingHTTP(unittest.TestCase):
    def setUp(self):
        self.uid = make_user()
        self.staff_id = make_user(("staff",))
        self.other_staff_id = make_user(("staff",))
        self.admin_id = make_user(("admin", "staff"))
        self.ticket = make_ticket(self.uid, title="预约接口回归")
        self.loc_id, self.event_id = new_id("loc"), new_id("evt")
        self.slot_ids = [new_id("slt") for _ in range(3)]
        now = utcnow()
        with tx() as conn:
            conn.execute("INSERT INTO service_locations (id,name,building_room) VALUES (?,?,?)",
                         (self.loc_id, "测试服务点", "教学楼 101"))
            conn.execute("INSERT INTO service_events (id,location_id,title,service_date,created_at) "
                         "VALUES (?,?,?,?,?)", (self.event_id, self.loc_id, "接口测试活动",
                         (now + timedelta(days=3)).date().isoformat(), now.isoformat()))
            for index, sid in enumerate(self.slot_ids):
                conn.execute("INSERT INTO service_slots (id,event_id,start_at,end_at,capacity) VALUES (?,?,?,?,1)",
                             (sid, self.event_id, f"{14 + index}:00", f"{14 + index}:30"))
        self.client = self.client_for(self.uid)

    def client_for(self, uid):
        client = TestClient(app)
        token, digest = new_session_token()
        csrf = new_csrf_token(digest)
        run("INSERT INTO auth_sessions VALUES (?,?,?,?,?,?)", (
            new_id("ses"), uid, digest, csrf, (utcnow() + timedelta(hours=1)).isoformat(), utcnow().isoformat()))
        client.cookies.set("zx_session", token)
        client.headers["x-csrf-token"] = csrf
        self.addCleanup(client.close)
        return client

    def hold(self, slot_index=0):
        response = self.client.post("/api/v1/appointment-holds", json={
            "slot_id": self.slot_ids[slot_index], "ticket_id": self.ticket["id"],
            "idempotency_key": str(uuid4()),
        })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def confirm(self, appt):
        response = self.client.post(f"/api/v1/appointments/{appt['id']}/confirm", json={
            "contact_name": "测试用户", "contact_phone": "13800000000",
        })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def slot(self, index=0):
        return q_one("SELECT * FROM service_slots WHERE id=?", (self.slot_ids[index],))

    def test_hold_recovers_from_ticket_detail_with_location(self):
        hold = self.hold()
        detail = self.client.get(f"/api/v1/tickets/{self.ticket['id']}").json()
        self.assertTrue(detail["can_manage"])
        restored = detail["active_appointment"]
        self.assertEqual(restored["id"], hold["id"])
        self.assertEqual(restored["slot"]["location"]["building_room"], "教学楼 101")
        self.assertEqual(restored["hold_expires_at"], hold["hold_expires_at"])
        self.confirm(restored)

    def test_direct_ticket_preserves_description(self):
        response = self.client.post("/api/v1/tickets", json={
            "title": "电脑不能开机", "description": "按下电源键后指示灯闪两次，没有画面",
        })
        self.assertEqual(response.status_code, 200, response.text)
        detail = self.client.get(f"/api/v1/tickets/{response.json()['id']}").json()
        self.assertEqual(detail["handoff"]["user_description"], "按下电源键后指示灯闪两次，没有画面")
        self.assertEqual(detail["handoff"]["tried_steps"], [])

    def test_expired_confirmation_commits_reclamation(self):
        hold = self.hold()
        run("UPDATE appointments SET hold_expires_at=? WHERE id=?",
            ((utcnow() - timedelta(seconds=1)).isoformat(), hold["id"]))
        response = self.client.post(f"/api/v1/appointments/{hold['id']}/confirm",
                                    json={"contact_name": "用户", "contact_phone": "13800000000"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(q_one("SELECT status FROM appointments WHERE id=?", (hold["id"],))["status"], "EXPIRED")
        self.assertEqual(self.slot()["held_count"], 0)
        self.assertNotIn("active_appointment", self.client.get(f"/api/v1/tickets/{self.ticket['id']}").json())
        # 不必先访问原时段，也能直接在其他时段预约。
        self.hold(1)

    def test_ticket_read_expires_hold(self):
        hold = self.hold()
        run("UPDATE appointments SET hold_expires_at=? WHERE id=?",
            ((utcnow() - timedelta(seconds=1)).isoformat(), hold["id"]))
        self.assertNotIn("active_appointment", self.client.get(f"/api/v1/tickets/{self.ticket['id']}").json())
        self.assertEqual(self.slot()["held_count"], 0)

    def test_cancel_ticket_releases_confirmed_booking(self):
        appt = self.confirm(self.hold())
        response = self.client.post(f"/api/v1/tickets/{self.ticket['id']}/cancel")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.slot()["confirmed_count"], 0)
        self.assertEqual(q_one("SELECT status FROM appointments WHERE id=?", (appt["id"],))["status"], "CANCELLED")
        denied = self.client.post("/api/v1/appointment-holds", json={
            "slot_id": self.slot_ids[1], "ticket_id": self.ticket["id"],
        })
        self.assertEqual(denied.status_code, 409)

    def test_cancel_ticket_releases_unconfirmed_hold(self):
        self.hold()
        response = self.client.post(f"/api/v1/tickets/{self.ticket['id']}/cancel")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.slot()["held_count"], 0)

    def test_closed_and_past_events_rejected_by_write_api(self):
        for sql, params in [
            ("UPDATE service_events SET status='draft' WHERE id=?", (self.event_id,)),
            ("UPDATE service_events SET status='published',service_date='2000-01-01' WHERE id=?", (self.event_id,)),
        ]:
            run(sql, params)
            response = self.client.post("/api/v1/appointment-holds", json={
                "slot_id": self.slot_ids[0], "ticket_id": self.ticket["id"],
            })
            self.assertEqual(response.status_code, 409)
            self.assertEqual(self.slot()["held_count"], 0)
        self.assertNotIn(self.event_id, [e["id"] for e in self.client.get("/api/v1/service-events").json()])

    def test_location_closed_after_hold_rejects_confirmation(self):
        hold = self.hold()
        run("UPDATE service_locations SET is_open='closed' WHERE id=?", (self.loc_id,))
        response = self.client.post(f"/api/v1/appointments/{hold['id']}/confirm",
                                    json={"contact_name": "用户", "contact_phone": "13800000000"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.slot()["confirmed_count"], 0)

    def test_reschedule_retry_only_moves_capacity_once(self):
        appt = self.confirm(self.hold())
        payload = {"new_slot_id": self.slot_ids[1], "idempotency_key": str(uuid4())}
        url = f"/api/v1/appointments/{appt['id']}/reschedule"
        first = self.client.post(url, json=payload)
        retry = self.client.post(url, json=payload)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json(), retry.json())
        self.assertEqual(self.slot()["confirmed_count"], 0)
        self.assertEqual(self.slot(1)["confirmed_count"], 1)
        self.assertEqual(first.json()["checkin_code"], appt["checkin_code"])
        self.assertEqual(self.client.post(url, json={**payload, "new_slot_id": self.slot_ids[2]}).status_code, 409)
        newer = self.client.post(url, json={"new_slot_id": self.slot_ids[2], "idempotency_key": str(uuid4())})
        self.assertEqual(newer.status_code, 200, newer.text)
        self.assertEqual(self.client.post(url, json=payload).status_code, 409)
        self.assertEqual(self.slot(2)["confirmed_count"], 1)
        self.assertEqual(self.slot(1)["confirmed_count"], 0)

    def test_reschedule_closed_target_keeps_original(self):
        appt = self.confirm(self.hold())
        run("UPDATE service_events SET status='draft' WHERE id=?", (self.event_id,))
        response = self.client.post(f"/api/v1/appointments/{appt['id']}/reschedule",
                                    json={"new_slot_id": self.slot_ids[1]})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.slot()["confirmed_count"], 1)
        self.assertEqual(self.slot(1)["confirmed_count"], 0)

    def test_idempotency_key_cannot_expose_other_users_data(self):
        key = str(uuid4())
        appt = scheduling.create_hold(user_id=self.uid, slot_id=self.slot_ids[0],
                                     ticket_id=self.ticket["id"], idempotency_key=key)
        other_uid = make_user()
        other_ticket = make_ticket(other_uid)
        with self.assertRaises(ApiError) as ctx:
            scheduling.create_hold(user_id=other_uid, slot_id=self.slot_ids[0],
                                   ticket_id=other_ticket["id"], idempotency_key=key)
        self.assertEqual(ctx.exception.status_code, 409)
        key = str(uuid4())
        make_ticket(self.uid, idempotency_key=key)
        with self.assertRaises(ApiError):
            make_ticket(other_uid, idempotency_key=key)
        other = self.client_for(other_uid)
        self.assertEqual(other.get(f"/api/v1/tickets/{self.ticket['id']}").status_code, 403)
        self.assertEqual(other.post(f"/api/v1/appointments/{appt['id']}/confirm", json={
            "contact_name": "用户", "contact_phone": "13800000000"}).status_code, 404)

    def test_concurrent_same_key_returns_one_hold(self):
        key = str(uuid4())
        def reserve(_):
            return scheduling.create_hold(user_id=self.uid, slot_id=self.slot_ids[0],
                                          ticket_id=self.ticket["id"], idempotency_key=key)["id"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
            ids = list(pool.map(reserve, range(10)))
        self.assertEqual(len(set(ids)), 1)
        self.assertEqual(self.slot()["held_count"], 1)

    def test_ten_users_compete_for_exactly_one_place(self):
        candidates = [(uid, make_ticket(uid)) for uid in [make_user() for _ in range(10)]]
        def reserve(candidate):
            uid, ticket = candidate
            try:
                scheduling.create_hold(user_id=uid, slot_id=self.slot_ids[0],
                                       ticket_id=ticket["id"], idempotency_key=None)
                return 200
            except ApiError as exc:
                return exc.status_code
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
            results = list(pool.map(reserve, candidates))
        self.assertEqual(results.count(200), 1)
        self.assertEqual(results.count(409), 9)
        self.assertEqual(self.slot()["held_count"], 1)

    def test_expired_hold_cannot_confirm_while_new_user_reserves(self):
        hold = self.hold()
        run("UPDATE appointments SET hold_expires_at=? WHERE id=?",
            ((utcnow() - timedelta(seconds=1)).isoformat(), hold["id"]))
        uid = make_user()
        ticket = make_ticket(uid)
        def old_confirm():
            try:
                scheduling.confirm_booking(user_id=self.uid, appointment_id=hold["id"],
                    contact_name="用户", contact_phone="13800000000", idempotency_key=None)
                return 200
            except ApiError as exc:
                return exc.status_code
        def new_reserve():
            return scheduling.create_hold(user_id=uid, slot_id=self.slot_ids[0],
                                          ticket_id=ticket["id"], idempotency_key=None)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            old, new = pool.submit(old_confirm), pool.submit(new_reserve)
            self.assertEqual(old.result(), 409)
            self.assertEqual(new.result()["status"], "HELD")
        slot = self.slot()
        self.assertEqual((slot["held_count"], slot["confirmed_count"]), (1, 0))

    def test_unassigned_staff_cannot_read_write_or_checkin(self):
        assigned = tickets.assign(ticket_id=self.ticket["id"], assignee_id=self.staff_id,
                                  expected_version=self.ticket["version"], actor_id=self.admin_id)
        appt = self.confirm(self.hold())
        other = self.client_for(self.other_staff_id)
        self.assertNotIn(self.ticket["id"], [t["id"] for t in other.get("/api/v1/staff/tickets").json()])
        self.assertEqual(other.get(f"/api/v1/tickets/{self.ticket['id']}").status_code, 403)
        response = other.post(f"/api/v1/staff/tickets/{self.ticket['id']}/repair-records",
                              json={"check_items": "越权写入"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(other.post(f"/api/v1/staff/appointments/{appt['id']}/check-in",
                                    json={"code": appt["checkin_code"]}).status_code, 403)
        staff = self.client_for(self.staff_id)
        detail = staff.get(f"/api/v1/tickets/{assigned['id']}").json()
        self.assertFalse(detail["can_manage"])
        self.assertNotIn("checkin_code", detail["active_appointment"])
        self.assertNotIn("contact_phone", detail["active_appointment"])

    def test_full_http_repair_and_reopen(self):
        admin = self.client_for(self.admin_id)
        response = admin.post(f"/api/v1/admin/tickets/{self.ticket['id']}/assign", json={
            "assignee_id": self.staff_id, "version": self.ticket["version"],
        })
        self.assertEqual(response.status_code, 200, response.text)
        appt = self.confirm(self.hold())
        staff = self.client_for(self.staff_id)
        self.assertEqual(staff.post(f"/api/v1/staff/appointments/{appt['id']}/check-in",
                                    json={"code": "wrong-code"}).status_code, 400)
        checked = staff.post(f"/api/v1/staff/appointments/{appt['id']}/check-in",
                             json={"code": appt["checkin_code"]})
        self.assertEqual(checked.status_code, 200, checked.text)
        self.assertEqual(checked.json()["contact_phone"], "138****0000")
        response = staff.post(f"/api/v1/staff/tickets/{self.ticket['id']}/repair-records", json={
            "check_items": "检查接口", "action_taken": "建议专业检修", "verification": "记录现象",
            "conclusion": "referred", "submit_result": True,
        })
        self.assertEqual(response.status_code, 200, response.text)
        response = self.client.post(f"/api/v1/tickets/{self.ticket['id']}/verification", json={"fixed": True})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["outcome"], "referred")
        self.assertNotIn("active_appointment", response.json())
        self.assertEqual(q_one("SELECT status FROM appointments WHERE id=?", (appt["id"],))["status"], "COMPLETED")
        reopened = self.client.post(f"/api/v1/tickets/{self.ticket['id']}/reopen", json={"reason": "同一问题复发"})
        self.assertEqual(reopened.status_code, 200, reopened.text)
        self.assertEqual(reopened.json()["outcome_confirmed_by_user"], "no")
        self.hold(1)

    def test_csrf_uses_current_session_and_logout_revokes_token(self):
        second = self.client_for(self.uid)
        response = self.client.get("/api/v1/auth/csrf")
        self.assertEqual(response.json()["csrf_token"], self.client.headers["x-csrf-token"])
        token = self.client.cookies.get("zx_session")
        csrf = self.client.headers.pop("x-csrf-token")
        self.assertEqual(self.client.post("/api/v1/appointment-holds", json={
            "slot_id": self.slot_ids[0], "ticket_id": self.ticket["id"]}).status_code, 403)
        self.client.headers["x-csrf-token"] = csrf
        self.assertEqual(self.client.post("/api/v1/auth/logout").status_code, 200)
        self.client.cookies.set("zx_session", token)
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 401)
        self.assertEqual(second.get("/api/v1/auth/me").status_code, 200)

    def test_stale_ticket_transition_rejected(self):
        tickets.assign(ticket_id=self.ticket["id"], assignee_id=self.staff_id,
                       expected_version=self.ticket["version"], actor_id=self.admin_id)
        with self.assertRaises(ApiError):
            tickets.transition(self.ticket, "CANCELLED", actor_id=self.uid)
        self.assertEqual(q_one("SELECT status FROM tickets WHERE id=?", (self.ticket["id"],))["status"], "ACCEPTED")
