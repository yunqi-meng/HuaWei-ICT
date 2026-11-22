"""模型优先排障的纯函数校验测试（不依赖 HTTP 事件循环）。"""
import unittest
from unittest.mock import patch
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.modules.diagnosis import model_flow


class ModelFlowValidationTest(unittest.TestCase):
    def setUp(self):
        self.refs = [{
            "citation_id": "cit_1", "title": "网络排查指南",
            "source_url": "https://example.com/network", "snippet": "检查代理与 DNS。",
        }]

    def _step(self, **overrides):
        data = {
            "reply": "先确认单个网页还是全部网页。",
            "title": "确认故障范围",
            "instruction": "打开浏览器访问两个不同网站。",
            "why": "区分单站点问题与整机网络问题。",
            "expected_observation": "两个网站都无法打开。",
            "risk_level": "observe",
            "options": [
                {"key": "all_fail", "label": "所有网页都打不开"},
                {"key": "one_fail", "label": "只有这个网站打不开"},
            ],
            "citations": ["cit_1"],
            "action": "continue",
            "handoff_reason": "",
        }
        data.update(overrides)
        return data

    def test_accepts_safe_step_and_keeps_known_citation(self):
        step = model_flow.validate_step(self._step(), self.refs)
        self.assertIsNotNone(step)
        self.assertEqual(step["evidence_status"], "model_generated")
        self.assertEqual(step["citations"], ["cit_1"])
        self.assertEqual(step["source_refs"][0]["url"], "https://example.com/network")
        self.assertEqual(len(step["options"]), 2)

    def test_rejects_command_line_and_registry(self):
        for instruction in (
            "打开 PowerShell 执行以下命令修复网络。",
            "进入注册表把驱动回滚到旧版本。",
            "用 diskpart 重新分区。",
        ):
            with self.subTest(instruction=instruction):
                self.assertIsNone(model_flow.validate_step(
                    self._step(instruction=instruction), self.refs))

    def test_rejects_unrequested_actions_phrase(self):
        self.assertIsNone(model_flow.validate_step(
            self._step(instruction="执行下面的脚本即可。"), self.refs))

    def test_unknown_or_malformed_citations_are_rejected(self):
        for citations in (["cit_unknown"], ["cit_unknown", "cit_1"], ["cit_1", None], [{}]):
            with self.subTest(citations=citations):
                self.assertIsNone(model_flow.validate_step(self._step(citations=citations), self.refs))

    def test_operations_require_citations_even_when_retrieval_is_empty(self):
        for action in ("continue", "verify"):
            for refs in (self.refs, []):
                with self.subTest(action=action, refs=refs):
                    self.assertIsNone(model_flow.validate_step(self._step(action=action, citations=[]), refs))

    def test_reply_cannot_bypass_citation_requirement(self):
        self.assertIsNone(model_flow.validate_step(self._step(instruction="", citations=[]), []))

    def test_unreferenced_handoff_remains_available(self):
        step = model_flow.validate_step(self._step(action="handoff", instruction="", citations=[]), [])
        self.assertIsNotNone(step)

    def test_known_citations_are_deduplicated(self):
        step = model_flow.validate_step(self._step(citations=["cit_1", "cit_1"]), self.refs)
        self.assertEqual(step["citations"], ["cit_1"])

    def test_low_option_count_gets_unsure_fallback(self):
        step = model_flow.validate_step(
            self._step(options=[{"key": "only", "label": "只有这一项"}]), self.refs)
        self.assertIsNotNone(step)
        self.assertEqual([o["key"] for o in step["options"]], ["only", "ai_unsure"])

    def test_step_view_and_invalid_payload(self):
        self.assertIsNone(model_flow.step_view({"id": "s", "state": "GUIDE", "facts": None}))
        step = model_flow.validate_step(self._step(), self.refs)
        view = model_flow.step_view({
            "id": "s", "state": "GUIDE",
            "facts": {"ai_step": step, "ai_step_node": "__ai_step_1__"},
        })
        self.assertEqual(view["step_id"], "__ai_step_1__")
        self.assertEqual(view["evidence_status"], "model_generated")
        self.assertEqual(view["flow_version"], "AI 生成·未经人工审核")

    def test_invalid_containers_and_control_fields_are_rejected(self):
        for override in (
            {"options": 1}, {"options": "yes"}, {"options": None},
            {"citations": 1}, {"citations": "cit_1"},
            {"risk_level": "high"}, {"risk_level": None},
            {"action": "execute"}, {"action": None},
        ):
            with self.subTest(override=override):
                self.assertIsNone(model_flow.validate_step(self._step(**override), self.refs))

    def test_safety_checks_include_options_reasons_and_unclipped_text(self):
        for override in (
            {"options": [{"key": "go", "label": "更新显卡驱动"}]},
            {"handoff_reason": "进入 BIOS 修改设置"},
            {"instruction": "观察窗口。" * 130 + "打开 PowerShell"},
            {"instruction": "回滚声卡驱动后重试"},
        ):
            with self.subTest(override=override):
                self.assertIsNone(model_flow.validate_step(self._step(**override), self.refs))

    def test_empty_options_get_two_distinct_choices(self):
        for options in ([], [{"key": "ai_unsure", "label": "不确定"}]):
            with self.subTest(options=options):
                step = model_flow.validate_step(self._step(options=options), self.refs)
                self.assertEqual(len(step["options"]), 2)
                self.assertEqual(len({o["key"] for o in step["options"]}), 2)

    def test_non_text_model_content_falls_back(self):
        for raw in (None, 42, [], {"content": "unexpected"}, " ", "invalid json"):
            with self.subTest(raw=raw), patch.object(model_flow, "generate_diagnosis_step", return_value=(raw, self.refs)):
                self.assertIsNone(model_flow.generate_step({}))


if __name__ == "__main__":
    unittest.main()
