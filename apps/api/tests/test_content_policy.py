"""正式环境不接受种子审核字段；审核发布、公共读取与活跃流程均需真实审核记录。"""
import unittest
from unittest.mock import patch
from uuid import uuid4

import test_booking_http as fixtures
from helpers import make_user
from app.config import get_settings
from app.db import q_one
from app.modules.diagnosis import engine
from app.modules.knowledge.retrieval import search
from app.readiness import inspect_readiness


class ContentPolicyTests(unittest.TestCase):
    setUp = fixtures.TestBookingHTTP.setUp
    client_for = fixtures.TestBookingHTTP.client_for

    def test_production_hides_unreviewed_seed_from_guides_search_and_flows(self):
        guide = q_one("SELECT d.id,v.id AS version_id FROM knowledge_documents d JOIN knowledge_versions v ON v.document_id=d.id "
                      "WHERE v.status='published' AND v.reviewed_at IS NULL LIMIT 1")
        flow = q_one("SELECT v.id,f.key FROM flow_versions v JOIN flows f ON f.id=v.flow_id "
                     "WHERE f.key='network-no-internet' AND v.status='published'")
        self.assertEqual(self.client.get(f"/api/v1/guides/{guide['id']}").status_code, 200)
        with patch.object(get_settings(), "app_env", "production"):
            self.assertEqual(self.client.get(f"/api/v1/guides/{guide['id']}").status_code, 404)
            self.assertNotIn(guide["id"], [g["id"] for g in self.client.get('/api/v1/guides').json()])
            self.assertNotIn(flow["key"], [f["flow_key"] for f in self.client.get('/api/v1/flows/published').json()])
            self.assertNotIn(guide["version_id"], [r["version_id"] for r in search("Wi-Fi 网页打不开", self.uid, trace=False)["results"]])
            self.assertIsNone(engine.get_flow_version(flow["id"]))

    def test_old_unreviewed_session_cannot_continue_after_switching_environment(self):
        session = engine.start_session(self.uid, None, "Wi-Fi连上但网页打不开")
        self.assertEqual(session["state"], "GUIDE")
        with patch.object(get_settings(), "app_env", "production"):
            self.assertIsNone(engine.current_step_view(session))
            self.assertEqual(engine.get_session(session["id"])["state"], "HANDOFF")

    def test_dual_reviewed_guide_is_public_in_production(self):
        author = self.client_for(self.admin_id)
        reviewer = self.client_for(make_user(("reviewer",)))
        keyword = 'review-policy-' + uuid4().hex
        data = {"category": "network", "content": keyword + " 检查网络连接状态。",
                "source_refs": [{"title": "网络说明", "url": "https://support.microsoft.com/zh-cn/windows"}],
                "applicability": {"os_family": "windows", "risk_level": "observe", "symptom_tags": ["network"]}}
        draft = author.post('/api/v1/admin/content', json={"kind": "guide", "title": keyword, "payload": data}).json()
        author.post(f"/api/v1/admin/content/{draft['id']}/submit")
        approved = reviewer.post(f"/api/v1/admin/content/{draft['id']}/review", json={"approve": True, "note": "隔离测试审核"})
        self.assertEqual(approved.status_code, 200, approved.text)
        vid = approved.json()["version_id"]
        doc = q_one("SELECT document_id FROM knowledge_versions WHERE id=?", (vid,))["document_id"]
        with patch.object(get_settings(), "app_env", "production"):
            self.assertEqual(self.client.get(f"/api/v1/guides/{doc}").status_code, 200)
            self.assertIn(vid, [r["version_id"] for r in search(keyword, self.uid, trace=False)["results"]])

    def test_readiness_reports_missing_evidence_without_exposing_credentials(self):
        with patch.object(get_settings(), "auto_seed", False):
            report = inspect_readiness()
        self.assertGreaterEqual(report["counts"]["active_demo_accounts"], 6)
        self.assertGreaterEqual(report["counts"]["guides_without_dual_review"], 10)
        self.assertTrue(report["blockers"])
        self.assertTrue(report["external_evidence_required"])
        self.assertNotIn(get_settings().secret_key, str(report))
