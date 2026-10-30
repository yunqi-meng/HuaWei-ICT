"""完整 Web 业务的跨模块验收，不对真实外部服务发送请求。"""
import io
import json
import tempfile
import unittest
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4
from pathlib import Path
from types import SimpleNamespace
from PIL import Image
import test_booking_http as fixtures
from helpers import make_ticket, make_user
from app.config import get_settings
from app.db import q_all, q_one, run
from app.models import validate_flow_graph
from app.security import utcnow


class TestV1(unittest.TestCase):
    setUp = fixtures.TestBookingHTTP.setUp
    client_for = fixtures.TestBookingHTTP.client_for
    hold = fixtures.TestBookingHTTP.hold
    confirm = fixtures.TestBookingHTTP.confirm
    slot = fixtures.TestBookingHTTP.slot

    def admin(self):
        return self.client_for(self.admin_id)

    def test_handoff_retry_after_refresh_does_not_duplicate_active_ticket(self):
        session = self.client.post("/api/v1/diagnosis-sessions", json={"symptom_text": "外接显示器没有画面"}).json()
        first = self.client.post("/api/v1/tickets", json={"title": "需要人工检查", "session_id": session["id"], "handoff_confirmed": True, "idempotency_key": str(uuid4())})
        second = self.client.post("/api/v1/tickets", json={"title": "需要人工检查", "session_id": session["id"], "handoff_confirmed": True, "idempotency_key": str(uuid4())})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(first.json()["id"], second.json()["id"])

    def test_fault_device_and_environment_gate(self):
        session = self.client.post("/api/v1/diagnosis-sessions", json={"symptom_text": "Wi-Fi 连上但网页打不开"}).json()
        self.assertEqual(session["state"], "CLARIFY")
        self.assertEqual(session["current_step"]["step_id"], "__clarify_env__")
        invalid = self.client.post(f"/api/v1/diagnosis-sessions/{session['id']}/messages", json={"option_key": "cat_audio"})
        self.assertEqual(invalid.status_code, 400)
        supported = self.client.post(f"/api/v1/diagnosis-sessions/{session['id']}/messages", json={"option_key": "os_win11"})
        self.assertEqual(supported.json()["state"], "GUIDE")
        mac = self.client.post("/api/v1/devices", json={"brand_model": "故障 Mac", "os_family": "macos", "os_version": "macOS"}).json()
        s = self.client.post("/api/v1/diagnosis-sessions", json={"device_id": mac["id"], "symptom_text": "电脑无声"})
        self.assertEqual(s.json()["state"], "HANDOFF")
        other = self.client_for(make_user())
        self.assertEqual(other.post("/api/v1/diagnosis-sessions", json={"device_id": mac["id"], "symptom_text": "无声"}).status_code, 404)

    def test_device_edit_delete_and_history_protection(self):
        d = self.client.post("/api/v1/devices", json={"brand_model": "测试电脑"}).json()
        self.assertEqual(self.client.put(f"/api/v1/devices/{d['id']}", json={"brand_model": "新备注"}).status_code, 200)
        self.assertEqual(self.client.delete(f"/api/v1/devices/{d['id']}").status_code, 200)
        d = self.client.post("/api/v1/devices", json={"brand_model": "测试电脑"}).json()
        self.client.post("/api/v1/diagnosis-sessions", json={"device_id": d["id"], "symptom_text": "无声"})
        self.assertEqual(self.client.delete(f"/api/v1/devices/{d['id']}").status_code, 409)

    def test_pause_resume_and_optimistic_feedback(self):
        s = self.client.post("/api/v1/diagnosis-sessions", json={"symptom_text": "网页打不开"}).json()
        root = f"/api/v1/diagnosis-sessions/{s['id']}"
        self.assertEqual(self.client.post(root + "/pause").json()["state"], "PAUSED")
        self.assertEqual(self.client.post(root + "/messages", json={"option_key": "os_win11"}).status_code, 409)
        self.client.post(root + "/resume")
        self.assertEqual(self.client.post(root + "/messages", json={"option_key": "os_win11", "version": s["version"]}).status_code, 409)
        self.assertEqual(self.client.post(root + "/messages", json={"option_key": "os_win11"}).json()["state"], "GUIDE")

    def test_private_image_upload_and_ticket_handoff(self):
        with tempfile.TemporaryDirectory() as root, patch.object(get_settings(), "upload_dir", root):
            s = self.client.post("/api/v1/diagnosis-sessions", json={"symptom_text": "网页打不开"}).json()
            png = io.BytesIO()
            Image.new("RGB", (32, 20), "blue").save(png, "PNG")
            response = self.client.post("/api/v1/attachments", data={"session_id": s["id"]}, files={"file": ("screen.png", png.getvalue(), "image/png")})
            self.assertEqual(response.status_code, 200, response.text)
            aid = response.json()["id"]
            foreign = self.client_for(make_user())
            self.assertEqual(foreign.get(f"/api/v1/attachments/{aid}").status_code, 404)
            self.assertEqual(self.client.get(f"/api/v1/attachments/{aid}").headers["content-type"], "image/jpeg")
            t = self.client.post("/api/v1/tickets", json={"title": "网络故障", "session_id": s["id"], "handoff_confirmed": True}).json()
            admin = self.admin()
            admin.post(f"/api/v1/admin/tickets/{t['id']}/assign", json={"assignee_id": self.staff_id, "version": t["version"]})
            staff = self.client_for(self.staff_id)
            self.assertEqual(staff.get(f"/api/v1/attachments/{aid}").status_code, 200)
            self.assertEqual(staff.delete(f"/api/v1/attachments/{aid}").status_code, 403)
            field_photo = staff.post("/api/v1/attachments", data={"ticket_id": t["id"]}, files={"file": ("field.png", png.getvalue(), "image/png")}).json()
            current = staff.get(f"/api/v1/tickets/{t['id']}").json()
            moved = admin.post(f"/api/v1/admin/tickets/{t['id']}/transfer", json={"assignee_id": self.other_staff_id, "version": current["version"], "reason": "更换现场负责人员"})
            self.assertEqual(moved.status_code, 200, moved.text)
            self.assertEqual(staff.get(f"/api/v1/attachments/{field_photo['id']}").status_code, 404)
            self.assertEqual(self.client.get(f"/api/v1/attachments/{field_photo['id']}").status_code, 200)
            self.assertEqual(self.client.delete(f"/api/v1/attachments/{aid}").status_code, 200)
            self.assertEqual(self.client.get(f"/api/v1/attachments/{aid}").status_code, 404)

    def test_image_payload_validation(self):
        response = self.client.post("/api/v1/attachments", data={"ticket_id": self.ticket["id"]}, files={"file": ("evil.svg", b"<svg onload='bad()'/>", "image/svg+xml")})
        self.assertEqual(response.status_code, 400)
        other = self.client_for(make_user())
        self.assertEqual(other.get(f"/api/v1/attachments?ticket_id={self.ticket['id']}").status_code, 404)

    def new_event(self, admin, staff_id=None):
        loc = admin.post("/api/v1/admin/locations", json={"name": "新服务点", "building_room": "科技楼 202", "workstations": 1}).json()
        payload = {"location_id": loc["id"], "title": "正式排班测试", "service_date": (utcnow()+timedelta(days=20)).date().isoformat(),
                   "slots": [{"start_at": "09:00", "end_at": "09:30", "capacity": 1}]}
        response = admin.post("/api/v1/admin/service-events", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        eid = response.json()["id"]
        if staff_id:
            response = admin.post(f"/api/v1/admin/service-events/{eid}/shifts", json={"staff_id": staff_id, "start_at": "09:00", "end_at": "10:00"})
            self.assertEqual(response.status_code, 200, response.text)
        return eid

    def test_publish_requires_staff_and_blocks_conflicting_shifts(self):
        admin = self.admin()
        eid = self.new_event(admin)
        self.assertEqual(admin.post(f"/api/v1/admin/service-events/{eid}/publish").status_code, 409)
        shift = {"staff_id": self.staff_id, "start_at": "09:00", "end_at": "10:00"}
        self.assertEqual(admin.post(f"/api/v1/admin/service-events/{eid}/shifts", json=shift).status_code, 200)
        self.assertEqual(admin.post(f"/api/v1/admin/service-events/{eid}/publish").status_code, 200)
        other_eid = self.new_event(admin)
        self.assertEqual(admin.post(f"/api/v1/admin/service-events/{other_eid}/shifts", json=shift).status_code, 409)
        self.assertEqual(self.client.get("/api/v1/admin/scheduling").status_code, 403)

    def test_cancellation_notifies_and_releases_capacity(self):
        admin = self.admin()
        eid = self.new_event(admin, self.staff_id)
        admin.post(f"/api/v1/admin/service-events/{eid}/publish")
        slot = self.client.get(f"/api/v1/service-slots?event_id={eid}").json()[0]
        hold = self.client.post("/api/v1/appointment-holds", json={"slot_id": slot["id"], "ticket_id": self.ticket["id"]}).json()
        self.confirm(hold)
        response = admin.post(f"/api/v1/admin/service-events/{eid}/cancel", json={"reason": "维修人员临时请假"})
        self.assertEqual(response.json()["affected_appointments"], 1)
        self.assertEqual(q_one("SELECT confirmed_count FROM service_slots WHERE id=?", (slot["id"],))["confirmed_count"], 0)
        notices = self.client.get("/api/v1/notifications").json()
        notice = next(n for n in notices if n["title"] == "义诊活动停诊")
        self.assertEqual(self.client.post(f"/api/v1/notifications/{notice['id']}/read").status_code, 200)
        self.assertEqual(self.client_for(make_user()).post(f"/api/v1/notifications/{notice['id']}/read").status_code, 404)

    def test_knowledge_dual_review_publication_and_withdrawal(self):
        admin = self.admin()
        reviewer = self.client_for(make_user(("reviewer",)))
        keyword = "测试知识" + uuid4().hex[:8]
        payload = {"category": "network", "content": f"{keyword}：检查网络影响范围，确认同网络的其他设备是否能正常上网。\n\n不要修改未知代理配置。",
                   "source_refs": [{"title": "微软网络排障", "url": "https://support.microsoft.com/zh-cn/windows"}],
                   "applicability": {"os_family": "windows", "risk_level": "observe", "symptom_tags": ["network"]}}
        s = admin.post("/api/v1/admin/content", json={"kind": "guide", "title": keyword, "payload": payload}).json()
        sid = s["id"]
        self.assertEqual(admin.post(f"/api/v1/admin/content/{sid}/submit").status_code, 200)
        self.assertEqual(admin.post(f"/api/v1/admin/content/{sid}/review", json={"approve": True, "note": "自审测试"}).status_code, 403)
        approved = reviewer.post(f"/api/v1/admin/content/{sid}/review", json={"approve": True, "note": "来源和适用环境已复核"})
        self.assertEqual(approved.status_code, 200, approved.text)
        results = self.client.get("/api/v1/search/knowledge", params={"q": keyword}).json()
        vid = approved.json()["version_id"]
        self.assertIn(vid, [r["version_id"] for r in results["results"]])
        self.assertEqual(results["retrieval_mode"], "bm25")
        admin.post(f"/api/v1/admin/knowledge/{vid}/withdraw")
        self.assertNotIn(vid, [r["version_id"] for r in self.client.get("/api/v1/search/knowledge", params={"q": keyword}).json()["results"]])
        self.assertEqual(self.client.get("/api/v1/admin/content").status_code, 403)

    def test_flow_validator_blocks_cycles_and_dangerous_nodes(self):
        self.assertTrue(validate_flow_graph({"entry": "a", "nodes": {"a": {"type": "action", "instruction": "format c:", "risk_level": "high", "options": {"again": {"next": "a"}}}}}))
        self.assertTrue(validate_flow_graph({"nodes": ["invalid"]}))
        self.assertTrue(validate_flow_graph({"entry": "a", "nodes": {"a": None}}))

    def test_resolution_requires_independent_final_verification(self):
        s = self.client.post("/api/v1/diagnosis-sessions", json={"symptom_text": "Wi-Fi 连上但网页打不开"}).json()
        root = f"/api/v1/diagnosis-sessions/{s['id']}/messages"
        for key in ("os_win11", "only_this", "worked"):
            response = self.client.post(root, json={"option_key": key})
            self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["state"], "VERIFY")
        self.assertIsNone(response.json()["end_reason"])
        self.assertEqual(self.client.post(root, json={"option_key": "verify_yes"}).json()["state"], "RESOLVED")

    def test_explicit_text_result_is_recorded_once_and_still_requires_verification(self):
        s = self.client.post("/api/v1/diagnosis-sessions", json={"symptom_text": "Wi-Fi 网页打不开"}).json()
        root = f"/api/v1/diagnosis-sessions/{s['id']}/messages"
        for key in ("os_win11", "only_this"):
            self.client.post(root, json={"option_key": key})
        response = self.client.post(root, json={"text": "已恢复", "client_message_id": "text-result-once"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["state"], "VERIFY")
        self.assertEqual(response.json()["tried_steps"][-1]["result"], "worked")
        again = self.client.post(root, json={"text": "已恢复", "client_message_id": "text-result-once"})
        self.assertEqual(again.json()["state"], "VERIFY")
        self.assertEqual(len(again.json()["tried_steps"]), len(response.json()["tried_steps"]))

    def test_manual_scope_is_blocked_without_losing_physical_risk(self):
        for text in ("教我格式化磁盘", "电脑鼓包了我想拆机"):
            response = self.client.post("/api/v1/diagnosis-sessions", json={"symptom_text": text})
            self.assertEqual(response.json()["state"], "HANDOFF")
            self.assertIsNone(response.json()["current_step"])
            if "鼓包" in text:
                self.assertIn("鼓包", response.json()["risk_flags"])

    def test_invalid_model_citation_falls_back(self):
        s = self.client.post("/api/v1/diagnosis-sessions", json={"symptom_text": "Wi-Fi 网页打不开"}).json()
        self.client.post(f"/api/v1/diagnosis-sessions/{s['id']}/messages", json={"option_key": "os_win11"})
        fake = SimpleNamespace(chat=lambda *_args, **_kwargs: '{"explanation":"错误解释","citation_ids":["fake-reference"]}')
        with patch("app.modules.integrations.llm.get_llm", return_value=fake):
            response = self.client.post(f"/api/v1/diagnosis-sessions/{s['id']}/explanation")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["mode"], "reviewed_text")

    def test_vector_index_uses_matching_model_and_withdrawn_data_excluded(self):
        from app.modules.knowledge import retrieval
        version = q_one("SELECT id FROM knowledge_versions WHERE status='published' LIMIT 1")["id"]
        fake = SimpleNamespace(enabled=True, embed=lambda texts: [[1., 0.] for _ in texts], rerank=lambda *_args: None)
        original = q_all("SELECT id,embedding,index_version FROM knowledge_chunks WHERE version_id=?", (version,))
        with patch.object(get_settings(), "maas_embedding_model", "test-model"), patch.object(retrieval, "get_llm", return_value=fake):
            try:
                retrieval.build_index(version)
                if get_settings().database_url.startswith("postgres"):
                    self.assertGreater(q_one("SELECT COUNT(*) AS n FROM knowledge_vectors WHERE model='test-model'")["n"], 0)
                result = retrieval.search("abcdefg-unique-vector-query", self.uid)
                self.assertEqual(result["retrieval_mode"], "hybrid")
                self.assertIn(version, [r["version_id"] for r in result["results"]])
                with patch.object(get_settings(), "maas_embedding_model", "another-model"):
                    result = retrieval.search("abcdefg-unique-vector-query", self.uid)
                    self.assertEqual(result["retrieval_mode"], "bm25")
            finally:
                for row in original:
                    run("UPDATE knowledge_chunks SET embedding=?,index_version=? WHERE id=?", (row["embedding"], row["index_version"], row["id"]))

    def test_worker_failure_is_retryable_and_not_recorded_as_sent(self):
        from app.workflow import enqueue
        from app.worker import process_one
        from app.db import tx
        with tx() as conn:
            enqueue(conn, "unknown-test-kind", {})
        job = q_one("SELECT id FROM outbox WHERE kind='unknown-test-kind' ORDER BY created_at DESC LIMIT 1")
        for _ in range(100):
            if not process_one():
                break
        row = q_one("SELECT * FROM outbox WHERE id=?", (job["id"],))
        self.assertEqual(row["status"], "pending")
        self.assertEqual(row["attempts"], 1)
        self.assertTrue(row["last_error"])

    def test_portable_backup_restores_into_empty_database_only(self):
        from app.maintenance import backup, restore
        with tempfile.TemporaryDirectory() as root:
            destination = Path(root) / "backup"
            backup(destination)
            with patch.object(get_settings(), "database_url", "sqlite:///" + str(Path(root)/"restored.db")):
                restore(destination)
                self.assertIsNotNone(q_one("SELECT id FROM tickets WHERE id=?", (self.ticket["id"],)))
                self.assertEqual(q_one("SELECT COUNT(*) AS n FROM auth_sessions")["n"], 0)
                with self.assertRaises(RuntimeError):
                    restore(destination)

    def test_active_flow_is_pinned_across_regular_publication_then_revoked(self):
        admin = self.admin()
        reviewer = self.client_for(make_user(("reviewer",)))
        keyword = "unique-flow-" + uuid4().hex
        def publish(instruction, entity_id=None):
            graph = {"entry": "check", "nodes": {"check": {"type": "observe", "title": "只读检查", "risk_level": "observe",
                "instruction": instruction, "expected_observation": "记录现象", "options": {"done": {"label": "已验证恢复", "outcome": "resolved"}}}}}
            draft = admin.post("/api/v1/admin/content", json={"kind": "flow", "entity_id": entity_id, "title": keyword,
                "payload": {"category": "app", "source_refs": [{"title": "官方来源", "url": "https://support.microsoft.com/zh-cn/windows"}],
                            "applicability": {"os_family": "windows", "risk_level": "observe"}, "graph": graph, "symptom_keywords": [keyword]}}).json()
            self.assertEqual(admin.post(f"/api/v1/admin/content/{draft['id']}/submit").status_code, 200)
            response = reviewer.post(f"/api/v1/admin/content/{draft['id']}/review", json={"approve": True, "note": "只读步骤和适用环境已复核"})
            self.assertEqual(response.status_code, 200, response.text)
            return response.json()["version_id"]
        old_version = publish("旧版说明")
        flow_id = q_one("SELECT flow_id FROM flow_versions WHERE id=?", (old_version,))["flow_id"]
        session = self.client.post("/api/v1/diagnosis-sessions", json={"symptom_text": keyword}).json()
        root = f"/api/v1/diagnosis-sessions/{session['id']}"
        self.client.post(root + "/messages", json={"option_key": "os_win11"})
        publish("新版说明", flow_id)
        self.assertEqual(self.client.get(root).json()["current_step"]["instruction"], "旧版说明")
        self.client.post(root + "/messages", json={"option_key": "done"})
        self.assertEqual(self.client.get(root).json()["state"], "VERIFY")
        admin.post(f"/api/v1/admin/flows/{old_version}/withdraw")
        self.assertEqual(self.client.post(root + "/messages", json={"option_key": "verify_yes"}).json()["state"], "HANDOFF")

    def test_administrative_closure_does_not_claim_user_confirmed_fix(self):
        from app.modules.tickets.service import assign, metrics
        assigned = assign(ticket_id=self.ticket["id"], assignee_id=self.staff_id, expected_version=self.ticket["version"], actor_id=self.admin_id)
        staff = self.client_for(self.staff_id)
        staff.post(f"/api/v1/staff/tickets/{assigned['id']}/state", json={"status": "IN_SERVICE", "version": assigned["version"], "reason": "现场检查开始"})
        staff.post(f"/api/v1/staff/tickets/{assigned['id']}/repair-records", json={"conclusion": "fixed", "submit_result": True})
        current = staff.get(f"/api/v1/tickets/{assigned['id']}").json()
        previous = metrics()["tickets_fixed_user_confirmed"]
        result = self.admin().post(f"/api/v1/admin/tickets/{assigned['id']}/administrative-close", json={"version": current["version"], "outcome": "fixed", "reason": "多次联系未收到用户验收"})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(metrics()["tickets_fixed_user_confirmed"], previous)
        self.assertEqual(self.client.post(f"/api/v1/tickets/{assigned['id']}/review", json={"rating": 4, "comment": "记录已保留"}).status_code, 200)
        self.assertEqual(self.client.post(f"/api/v1/tickets/{assigned['id']}/review", json={"rating": 5}).status_code, 409)

    def test_vision_requires_owner_consent_and_does_not_confirm_observations(self):
        with tempfile.TemporaryDirectory() as root, patch.object(get_settings(), "upload_dir", root):
            image = io.BytesIO()
            Image.new("RGB", (20, 20), "white").save(image, "PNG")
            uploaded = self.client.post("/api/v1/attachments", data={"ticket_id": self.ticket["id"]}, files={"file": ("error.png", image.getvalue(), "image/png")}).json()
            url = f"/api/v1/attachments/{uploaded['id']}/recognize"
            self.assertEqual(self.client.post(url, json={}).status_code, 403)
            fake = SimpleNamespace(enabled=True, chat=lambda *_a, **_k: '{"text":"屏幕出现错误码","error_codes":["0x123"]}')
            with patch.object(get_settings(), "model_provider", "deepseek"), patch("app.modules.integrations.llm.get_llm", return_value=fake):
                response = self.client.post(url, json={"consent_to_model": True})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertFalse(response.json()["verified"])

    def test_email_code_verification_and_last_admin_guard(self):
        with patch.object(get_settings(), "smtp_host", ""):
            result = self.client.post("/api/v1/auth/verification-code").json()
        self.assertFalse(result["queued"])
        self.assertIn("dev_code", result)
        self.assertEqual(self.client.post("/api/v1/auth/verify-email", json={"code": result["dev_code"]}).status_code, 200)
        self.assertTrue(self.client.get("/api/v1/auth/me").json()["email_verified"])
        self.assertEqual(self.client.post("/api/v1/auth/verify-email", json={"code": result["dev_code"]}).status_code, 400)
        self.assertEqual(self.client.get("/api/v1/admin/users").status_code, 403)
        admin = self.admin()
        self.assertNotIn("password_hash", admin.get("/api/v1/admin/users").json()[0])

    def test_transfer_waiting_state_and_user_response(self):
        from app.modules.tickets.service import assign
        assigned = assign(ticket_id=self.ticket["id"], assignee_id=self.staff_id, expected_version=self.ticket["version"], actor_id=self.admin_id)
        staff = self.client_for(self.staff_id)
        response = staff.post(f"/api/v1/staff/tickets/{assigned['id']}/state", json={"status": "IN_SERVICE", "version": assigned["version"], "reason": "现场检查开始"})
        self.assertEqual(response.status_code, 200)
        current = staff.get(f"/api/v1/tickets/{assigned['id']}").json()
        self.assertEqual(staff.post(f"/api/v1/staff/tickets/{assigned['id']}/state", json={"status": "WAITING_USER", "version": current["version"], "reason": "请提供错误截图"}).status_code, 200)
        self.assertEqual(self.client.post(f"/api/v1/tickets/{assigned['id']}/comments", json={"comment": "已经补充情况"}).status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/tickets/{assigned['id']}").json()["status"], "IN_SERVICE")
        current = staff.get(f"/api/v1/tickets/{assigned['id']}").json()
        response = self.admin().post(f"/api/v1/admin/tickets/{assigned['id']}/transfer", json={"assignee_id": self.other_staff_id, "version": current["version"], "reason": "调整负责人员"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(staff.get(f"/api/v1/tickets/{assigned['id']}").status_code, 403)

    def test_different_tickets_cannot_double_book_user_time(self):
        self.confirm(self.hold())
        second = make_ticket(self.uid)
        result = self.client.post("/api/v1/appointment-holds", json={"ticket_id": second["id"], "slot_id": self.slot_ids[0]})
        self.assertEqual(result.status_code, 409)
