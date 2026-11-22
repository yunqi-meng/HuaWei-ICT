"""模型优先排障：云端模型基于检索证据生成下一步，服务器做结构与安全校验。

边界（方案第 8 节）：
- 风险门禁、转人工、会话状态仍由业务代码控制；
- 只允许低风险、可逆的图形界面操作与观察项；命令、注册表、驱动、卸载、
  格式化、分区、BIOS、拆机等一律拒绝；
- 引用只能来自本次检索结果，材料视为不可信数据；
- 模型不可用或输出不合法时返回 None，由调用方回退到审核流程。
"""
from __future__ import annotations

import json
import re

from ..integrations.llm import get_llm
from ..knowledge.rag import generate_diagnosis_step

STEP_NODE_PREFIX = "__ai_step_"
MAX_REPLY = 400
MAX_TITLE = 60
MAX_INSTRUCTION = 600
MAX_WHY = 400
MAX_EXPECTED = 200
MAX_LABEL = 40
MAX_OPTIONS = 4
MAX_CITATIONS = 5

# 允许“打开设置 / 重启应用 / 检查连接”等图形界面操作；以下内容一律拒绝。
UNSAFE_PATTERN = re.compile(
    r"(?:cmd|powershell|regedit|reg\s+add|diskpart|bcdedit|format\s+[a-z]:|"
    r"del\s+/|rmdir|sudo|net\s+user|wmic|sc\s+(?:delete|stop)|taskkill|"
    r"注册表|驱动(?:程序)?(?:安装|更新|卸载|回滚)|(?:安装|更新|回滚).{0,6}驱动|卸载(?:软件|程序|驱动)?|"
    r"格式化|分区|bios|uefi|刷\s*固件|拆机|重装系统|恢复出厂|"
    r"管理员权限|远程控制|修改系统服务|组策略)",
    re.I,
)
UNSAFE_ACTION = re.compile(r"(?:执行|运行)(?:以下)?(?:.{0,8})(?:命令|脚本|终端|批处理)", re.I)


def available() -> bool:
    return get_llm().enabled


def _clip(value, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def generate_step(session: dict, user_input: str = "") -> dict | None:
    """LangChain RAG 链生成下一步；结构、引用或安全校验失败返回 None。"""
    raw, refs = generate_diagnosis_step(session, user_input)
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.S).strip()
        data = json.loads(raw)
    except (ValueError, TypeError):
        return None
    return validate_step(data, refs)


def validate_step(data: dict, refs: list[dict]) -> dict | None:
    """服务器强制校验；任何不合规都返回 None，由调用方回退。"""
    if not isinstance(data, dict):
        return None
    risk = data.get("risk_level")
    action = data.get("action")
    if risk not in ("observe", "low") or action not in ("continue", "verify", "handoff"):
        return None
    raw_options = data.get("options", [])
    raw_citations = data.get("citations", [])
    if not isinstance(raw_options, list) or not isinstance(raw_citations, list):
        return None
    refs = refs or []
    reply = _clip(data.get("reply"), MAX_REPLY)
    title = _clip(data.get("title"), MAX_TITLE)
    instruction = _clip(data.get("instruction"), MAX_INSTRUCTION)
    why = _clip(data.get("why"), MAX_WHY)
    expected = _clip(data.get("expected_observation"), MAX_EXPECTED)
    handoff_reason = _clip(data.get("handoff_reason"), 200)
    if not title:
        return None
    if action == "continue" and not (instruction or reply):
        return None
    # 检查原始文本，避免先截断把危险操作切成看似安全的半句。
    text_fields = ("reply", "title", "instruction", "why", "expected_observation", "handoff_reason")
    texts = [data[key] for key in text_fields if isinstance(data.get(key), str)]
    texts.extend(item["label"] for item in raw_options
                 if isinstance(item, dict) and isinstance(item.get("label"), str))
    combined = " ".join(texts)
    if UNSAFE_PATTERN.search(combined) or UNSAFE_ACTION.search(combined):
        return None

    options, seen = [], set()
    for item in raw_options:
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        label = _clip(item.get("label"), MAX_LABEL)
        if isinstance(key, str) and re.fullmatch(r"[a-z0-9_]{1,32}", key) and label and key not in seen:
            options.append({"key": key, "label": label})
            seen.add(key)
        if len(options) >= MAX_OPTIONS:
            break
    if action == "continue":
        for key, label in (("ai_unsure", "不确定或看不到这个设置"),
                           ("ai_feedback", "补充实际观察结果")):
            if len(options) >= 2:
                break
            if key not in seen:
                options.append({"key": key, "label": label})
                seen.add(key)

    ref_ids = [r["citation_id"] for r in refs]
    # 不接受捏造、混入或类型错误的引用，避免静默过滤后仍展示无依据的操作。
    if any(not isinstance(cid, str) or cid not in ref_ids for cid in raw_citations):
        return None
    # 继续/验证步骤必须有检索依据，包括 reply 中可能包含的操作；无依据走固定澄清或人工出口。
    if action != "handoff" and not raw_citations:
        return None
    cited = []
    for cid in raw_citations:
        if isinstance(cid, str) and cid in ref_ids and cid not in cited:
            cited.append(cid)
    by_id = {r["citation_id"]: r for r in refs}
    sources = [
        {"title": by_id[cid]["title"], "url": by_id[cid].get("source_url") or ""}
        for cid in cited[:MAX_CITATIONS]
    ]
    return {
        "reply": reply,
        "title": title,
        "instruction": instruction,
        "why": why,
        "expected_observation": expected,
        "risk_level": risk,
        "options": options,
        "citations": cited[:MAX_CITATIONS],
        "source_refs": sources,
        "action": action,
        "handoff_reason": handoff_reason,
        "evidence_status": "model_generated",
    }


def step_view(session: dict) -> dict | None:
    """把模型步骤渲染成与流程卡片一致的结构。"""
    step = (session.get("facts") or {}).get("ai_step")
    if not isinstance(step, dict) or not step.get("title"):
        return None
    return {
        "session_id": session["id"],
        "state": session["state"],
        "step_id": (session.get("facts") or {}).get("ai_step_node") or f"{STEP_NODE_PREFIX}1",
        "node_type": "ai_guide",
        "risk_level": step.get("risk_level", "observe"),
        "title": step.get("title"),
        "why": step.get("why", ""),
        "instruction": step.get("instruction", ""),
        "expected_observation": step.get("expected_observation", ""),
        "rollback": None,
        "stop_conditions": [],
        "options": step.get("options") or [],
        "evidence_status": "model_generated",
        "source_refs": step.get("source_refs") or [],
        "can_handoff": True,
        "flow_version": "AI 生成·未经人工审核",
    }
