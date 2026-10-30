"""诊断状态机用例：流程走通、幂等反馈、风险门禁、撤回阻断（方案 17.4 用例 7/8/9）。"""
import threading
import unittest

from helpers import book, get_slot, make_ticket, make_user

from app.db import q_one
from app.deps import ApiError
from app.modules.diagnosis import engine as diag
from app.modules.scheduling import service as svc
from app.modules.tickets import service as tsvc


class TestDiagnosis(unittest.TestCase):
    def test_guided_flow_to_resolved(self):
        uid = make_user()
        s = diag.start_session(uid, None, "Wi-Fi 连上但网页打不开")
        self.assertEqual(s["state"], "GUIDE")
        step = diag.current_step_view(s)
        self.assertEqual(step["step_id"], "check_scope")
        self.assertEqual(step["evidence_status"], "reviewed_flow_matched")
        self.assertTrue(step["source_refs"])

        for option in ("only_this", "worked"):
            s = diag.submit_feedback(s["id"], option_key=option, text=None,
                                     client_message_id=None)
        self.assertEqual(s["state"], "RESOLVED")
        self.assertEqual(s["end_reason"], "resolved")
        self.assertEqual(len(s["tried_steps"]), 2)

    def test_failed_steps_handoff(self):
        uid = make_user()
        s = diag.start_session(uid, None, "电脑没声音，外放无声")
        for option in ("correct_device", "all_fine", "still_fail"):
            s = diag.submit_feedback(s["id"], option_key=option, text=None,
                                     client_message_id=None)
        self.assertEqual(s["state"], "HANDOFF")
        self.assertGreaterEqual(s["failed_count"], 1)

    def test_high_risk_immediate_handoff(self):
        uid = make_user()
        s = diag.start_session(uid, None, "笔记本电池鼓包了怎么办")
        self.assertEqual(s["state"], "HANDOFF")
        self.assertIn("鼓包", s["risk_flags"])
        self.assertIsNone(diag.current_step_view(s))  # 不给出任何自助操作

    def test_mid_session_risk_escalation(self):
        uid = make_user()
        s = diag.start_session(uid, None, "Wi-Fi 连上但网页打不开")
        s = diag.submit_feedback(s["id"], option_key=None, text="刚才闻到一股焦味",
                                 client_message_id=None)
        self.assertEqual(s["state"], "HANDOFF")
        self.assertIn("焦味", s["risk_flags"])

    def test_idempotent_feedback(self):
        uid = make_user()
        s = diag.start_session(uid, None, "Wi-Fi 连上但网页打不开")
        s1 = diag.submit_feedback(s["id"], option_key="only_this", text=None,
                                  client_message_id="cli-001")
        # 网络重试：同一 client_message_id 不应二次推进
        s2 = diag.submit_feedback(s["id"], option_key="only_this", text=None,
                                  client_message_id="cli-001")
        self.assertEqual(s1["current_node"], s2["current_node"])
        self.assertEqual(len(s2["tried_steps"]), 1)

    def test_unknown_symptom_clarify_then_handoff(self):
        uid = make_user()
        s = diag.start_session(uid, None, "我的东西它坏了")
        self.assertEqual(s["state"], "CLARIFY")
        s = diag.submit_feedback(s["id"], option_key="cat_none", text=None,
                                 client_message_id=None)
        self.assertEqual(s["state"], "CLARIFY")
        s = diag.submit_feedback(s["id"], option_key="os_win11", text=None,
                                 client_message_id=None)
        self.assertEqual(s["state"], "HANDOFF")

    def test_flow_withdraw_blocks_active_session(self):
        uid = make_user()
        s = diag.start_session(uid, None, "Wi-Fi 连上但网页打不开")
        fv_id = s["flow_version_id"]

        from app.db import run
        run("UPDATE flow_versions SET status='withdrawn' WHERE id=?", (fv_id,))
        try:
            # 活跃会话再次读取：被阻断并转人工
            fresh = diag.get_session(s["id"])
            self.assertIsNone(diag.current_step_view(fresh))
            self.assertEqual(diag.get_session(s["id"])["state"], "HANDOFF")
            # 新会话不再命中被撤回的版本（可能匹配到其他流程或无匹配）
            s2 = diag.start_session(uid, None, "Wi-Fi 连上但网页打不开")
            self.assertNotEqual(s2["flow_version_id"], fv_id)
        finally:
            run("UPDATE flow_versions SET status='published' WHERE id=?", (fv_id,))

    def test_handoff_draft_content(self):
        uid = make_user()
        s = diag.start_session(uid, None, "外接显示器没有画面")
        diag.submit_feedback(s["id"], option_key="all_ok", text=None, client_message_id=None)
        draft = diag.build_handoff_draft(diag.get_session(s["id"]))
        self.assertEqual(draft["category"], "display")
        self.assertTrue(draft["tried_steps"])
        self.assertEqual(draft["hypotheses"], [])  # 推测单列，不混入事实


class TestBooking(unittest.TestCase):
    def test_concurrent_last_slot_only_one_wins(self):
        """多人同时抢名额，成功数恰好等于剩余容量（方案 17.4 用例 1）。"""
        slot = get_slot(event_index=1, slot_index=5)
        capacity = slot["remaining"]
        self.assertGreaterEqual(capacity, 1)

        results: list[str] = []
        lock = threading.Lock()

        def grab():
            uid = make_user()
            t = make_ticket(uid, title="并发抢票")
            try:
                svc.create_hold(user_id=uid, slot_id=slot["id"], ticket_id=t["id"],
                                idempotency_key=None)
                outcome = "ok"
            except ApiError as exc:
                outcome = str(exc.status_code)
            with lock:
                results.append(outcome)

        threads = [threading.Thread(target=grab) for _ in range(capacity + 3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(results.count("ok"), capacity)
        self.assertEqual(results.count("409"), len(results) - capacity)
        final = q_one("SELECT * FROM service_slots WHERE id=?", (slot["id"],))
        self.assertEqual(final["capacity"] - final["confirmed_count"] - final["held_count"], 0)

    def test_idempotent_hold(self):
        """同一幂等键重试只产生一张保留单（方案 17.4 用例 2）。"""
        uid = make_user()
        slot = get_slot(0, 0)
        t = make_ticket(uid, title="幂等测试")
        h1 = svc.create_hold(user_id=uid, slot_id=slot["id"], ticket_id=t["id"],
                             idempotency_key="idem-hold-1")
        h2 = svc.create_hold(user_id=uid, slot_id=slot["id"], ticket_id=t["id"],
                             idempotency_key="idem-hold-1")
        self.assertEqual(h1["id"], h2["id"])

    def test_confirm_idempotent_and_double_active_rejected(self):
        uid = make_user()
        slot = get_slot(0, 1)
        t = make_ticket(uid, title="重复确认")
        appt = book(uid, t["id"], slot["id"])
        self.assertEqual(appt["status"], "CONFIRMED")
        again = svc.confirm_booking(user_id=uid, appointment_id=appt["id"],
                                    contact_name="x", contact_phone="13800000000",
                                    idempotency_key=None)
        self.assertEqual(again["id"], appt["id"])
        slot2 = get_slot(0, 2)
        with self.assertRaises(ApiError) as ctx:
            svc.create_hold(user_id=uid, slot_id=slot2["id"], ticket_id=t["id"],
                            idempotency_key=None)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_reschedule_failure_keeps_original(self):
        """改期到满员时段失败，原预约保持有效（方案 17.4 用例 4）。"""
        full_slot = get_slot(0, 3)
        for _ in range(full_slot["remaining"]):
            ux = make_user()
            tx_ = make_ticket(ux, title="占位")
            book(ux, tx_["id"], full_slot["id"])

        uid = make_user()
        my_slot = get_slot(1, 0)
        t = make_ticket(uid, title="改期测试")
        appt = book(uid, t["id"], my_slot["id"])
        with self.assertRaises(ApiError) as ctx:
            svc.reschedule(user_id=uid, appointment_id=appt["id"],
                           new_slot_id=full_slot["id"], idempotency_key=None)
        self.assertEqual(ctx.exception.status_code, 409)
        current = q_one("SELECT * FROM appointments WHERE id=?", (appt["id"],))
        self.assertEqual(current["status"], "CONFIRMED")
        self.assertEqual(current["slot_id"], my_slot["id"])

    def test_cancel_releases_capacity(self):
        uid = make_user()
        slot = get_slot(1, 1)
        before = slot["remaining"]
        t = make_ticket(uid, title="取消测试")
        appt = book(uid, t["id"], slot["id"])
        svc.cancel_appointment(user_id=uid, appointment_id=appt["id"], reason="时间冲突")
        after = q_one("SELECT * FROM service_slots WHERE id=?", (slot["id"],))
        self.assertEqual(after["capacity"] - after["confirmed_count"] - after["held_count"],
                         before)


class TestTicketLifecycle(unittest.TestCase):
    def test_full_path_booking_to_closed(self):
        """提交 → 派单 → 预约 → 签到 → 维修 → 验收 → 结单。"""
        uid = make_user()
        staff_id = q_one("SELECT id FROM users WHERE email='staff@demo.local'")["id"]
        ticket = make_ticket(uid, title="耳机有声音，扬声器没声音")
        tid = ticket["id"]
        self.assertEqual(ticket["status"], "OPEN")

        t = tsvc.assign(ticket_id=tid, assignee_id=staff_id,
                        expected_version=ticket["version"], actor_id=staff_id)
        self.assertEqual(t["status"], "ACCEPTED")

        # 过期版本再派单被拒（方案 17.4 用例 5）
        with self.assertRaises(ApiError) as ctx:
            tsvc.assign(ticket_id=tid, assignee_id=staff_id,
                        expected_version=ticket["version"], actor_id=staff_id)
        self.assertEqual(ctx.exception.status_code, 409)

        slot = get_slot(1, 2)
        appt = book(uid, tid, slot["id"])
        self.assertTrue(appt["checkin_code"])

        with self.assertRaises(ApiError):  # 错误签到码
            svc.check_in(staff_id=staff_id, appointment_id=appt["id"], code="wrong-code")
        appt = svc.check_in(staff_id=staff_id, appointment_id=appt["id"],
                            code=appt["checkin_code"])
        self.assertEqual(appt["status"], "CHECKED_IN")
        self.assertEqual(q_one("SELECT status FROM tickets WHERE id=?", (tid,))["status"],
                         "IN_SERVICE")

        # 维修结果提交 → 待验收（结论枚举校验在 HTTP 层，此处验证状态机）
        t = q_one("SELECT * FROM tickets WHERE id=?", (tid,))
        t["risk_flags"] = []
        t = tsvc.transition(t, "AWAITING_VERIFICATION", actor_id=staff_id,
                            detail={"conclusion": "fixed"})
        self.assertEqual(t["status"], "AWAITING_VERIFICATION")

        # 用户验收 → 结单
        t = tsvc.submit_verification(t, fixed=True, actor_id=uid, comment="已恢复")
        self.assertEqual(t["status"], "CLOSED")
        self.assertEqual(t["outcome"], "fixed")
        self.assertEqual(t["outcome_confirmed_by_user"], "yes")

        # 复开（同一问题）
        t = tsvc.reopen(t, actor_id=uid, reason="同样问题复发")
        self.assertEqual(t["status"], "OPEN")
        self.assertIsNone(t["outcome"])

    def test_referred_not_counted_as_fixed(self):
        """转专业机构记为转介而非修复成功（方案 17.4 用例 10）。"""
        uid = make_user()
        ticket = make_ticket(uid, title="主板疑似损坏")
        tid = ticket["id"]
        from app.db import run
        run("UPDATE tickets SET status='AWAITING_VERIFICATION' WHERE id=?", (tid,))
        t = q_one("SELECT * FROM tickets WHERE id=?", (tid,))
        t["risk_flags"] = []
        # 手工写入结论为 referred 的验收事件
        run("INSERT INTO ticket_events (id, ticket_id, actor_id, event_type, to_status, detail, created_at) "
            "VALUES (?,?,?,?,?,?,datetime('now'))",
            (f"tev_test_{tid[:8]}", tid, "staff", "status_change", "AWAITING_VERIFICATION",
             '{"conclusion": "referred"}'))
        t = tsvc.submit_verification(t, fixed=True, actor_id=uid)
        self.assertEqual(t["outcome"], "referred")
        self.assertEqual(tsvc.metrics()["tickets_fixed_user_confirmed"], 0)

    def test_direct_ticket_without_ai(self):
        """跳过 AI 直接建工单（方案 17.4 用例 11）。"""
        uid = make_user()
        ticket = make_ticket(uid, title="直接到义诊点看看")
        self.assertIsNone(ticket["session_id"])
        self.assertEqual(ticket["status"], "OPEN")

    def test_invalid_transition_rejected(self):
        uid = make_user()
        ticket = make_ticket(uid, title="状态机测试")
        with self.assertRaises(ApiError):  # OPEN 不能直接验收
            tsvc.submit_verification(ticket, fixed=True, actor_id=uid)
        t = tsvc.transition(ticket, "CANCELLED", actor_id=uid, detail={"reason": "用户取消"})
        with self.assertRaises(ApiError):  # CANCELLED 终态不可再变
            tsvc.transition(t, "ACCEPTED", actor_id=uid)

    def test_handoff_ticket_carries_snapshot(self):
        """AI 转人工的工单携带完整交接摘要（方案 8.5）。"""
        uid = make_user()
        s = diag.start_session(uid, None, "电脑开机很慢，越来越卡")
        diag.submit_feedback(s["id"], option_key="many_items", text=None, client_message_id=None)
        ticket = tsvc.create_ticket(user={"id": uid}, payload={
            "title": "开机慢转人工", "session_id": s["id"], "device_id": None,
            "category": "", "description": "", "handoff_confirmed": True,
            "idempotency_key": None,
        })
        self.assertEqual(ticket["status"], "OPEN")
        snap = q_one("SELECT * FROM handoff_snapshots WHERE ticket_id=?", (ticket["id"],))
        self.assertIsNotNone(snap)
        import json as _json
        self.assertTrue(_json.loads(snap["tried_steps"]))
        self.assertIsInstance(_json.loads(snap["confirmed_facts"]), list)


if __name__ == "__main__":
    unittest.main()
