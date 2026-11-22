"""模型状态机回归：使用替身生成步骤，不调用外部服务。"""
import unittest
from unittest.mock import patch

from helpers import make_user
from app.modules.diagnosis import engine as diag


def step(action="continue"):
    return {
        "title": "确认网络状态", "reply": "检查当前连接状态。",
        "instruction": "观察网络设置中的连接状态。", "risk_level": "observe",
        "options": [{"key": "yes", "label": "已连接"}, {"key": "no", "label": "未连接"}],
        "action": action, "handoff_reason": "需要现场检查" if action == "handoff" else "",
    }


class ModelSessionTests(unittest.TestCase):
    def setUp(self):
        self.uid = make_user()
        self.addCleanup(patch.stopall)
        patch.object(diag.model_flow, "available", return_value=True).start()
        self.generate = patch.object(diag.model_flow, "generate_step", return_value=step()).start()

    def test_first_step_handoff_is_applied(self):
        self.generate.return_value = step("handoff")
        session = diag.start_session(self.uid, None, "网页打不开")
        self.assertEqual(session["state"], "HANDOFF")
        self.assertEqual(session["handoff_reason"], "需要现场检查")
        self.assertIsNone(diag.current_step_view(session))
        self.assertNotIn("ai_step", session["facts"])

    def test_first_step_verify_still_requires_user_confirmation(self):
        self.generate.return_value = step("verify")
        session = diag.start_session(self.uid, None, "网页打不开")
        self.assertEqual(session["state"], "VERIFY")
        self.assertEqual(diag.current_step_view(session)["step_id"], "__verify_result__")
        resolved = diag.submit_feedback(session["id"], option_key="verify_yes", text=None,
                                        client_message_id="confirm-first-step")
        self.assertEqual(resolved["state"], "RESOLVED")

    def test_followup_actions_share_the_same_state_transitions(self):
        for action, expected in (("continue", "GUIDE"), ("verify", "VERIFY"), ("handoff", "HANDOFF")):
            with self.subTest(action=action):
                self.generate.return_value = step()
                session = diag.start_session(self.uid, None, "网页打不开")
                self.generate.return_value = step(action)
                result = diag.submit_model_feedback(session["id"], option_key="yes", text=None,
                                                     client_message_id=None, expected_version=session["version"])
                self.assertEqual(result["state"], expected)
                self.assertEqual(len(result["tried_steps"]), 1)

    def test_handoff_summary_contains_observations_without_model_internal_fields(self):
        session = diag.start_session(self.uid, None, "网页打不开")
        session["facts"]["os"] = "Windows 11"
        draft = diag.build_handoff_draft(session)
        self.assertEqual(draft["confirmed_facts"], ["os: Windows 11"])

    def test_high_risk_skips_model_generation(self):
        session = diag.start_session(self.uid, None, "电池鼓包了")
        self.assertEqual(session["state"], "HANDOFF")
        self.generate.assert_not_called()
