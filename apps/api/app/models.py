"""领域常量与流程图校验（纯 Python，无 ORM 依赖）。

数据表结构见 app/db.py 的 SCHEMA；本模块只放枚举、状态机与校验函数。
"""
from __future__ import annotations

# ---- 角色 ----
ROLE_USER = "user"
ROLE_STAFF = "staff"
ROLE_ADMIN = "admin"
ALL_ROLES = (ROLE_USER, ROLE_STAFF, ROLE_ADMIN)

# ---- 诊断会话状态机 ----
SESSION_STATES = ("INTAKE", "CLARIFY", "RETRIEVE", "GUIDE", "VERIFY", "RESOLVED", "HANDOFF", "PAUSED")

# ---- 预约状态机 ----
APPT_STATUSES = ("HELD", "CONFIRMED", "CHECKED_IN", "COMPLETED", "EXPIRED", "CANCELLED", "NO_SHOW")

# ---- 工单状态机（方案 10.1） ----
TICKET_STATUSES = (
    "OPEN", "ACCEPTED", "IN_SERVICE", "WAITING_USER",
    "WAITING_EXTERNAL", "AWAITING_VERIFICATION", "CLOSED", "CANCELLED",
)

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "OPEN": {"ACCEPTED", "CANCELLED"},
    "ACCEPTED": {"IN_SERVICE", "CANCELLED"},
    "IN_SERVICE": {"WAITING_USER", "WAITING_EXTERNAL", "AWAITING_VERIFICATION", "CANCELLED"},
    "WAITING_USER": {"IN_SERVICE", "CANCELLED"},
    "WAITING_EXTERNAL": {"IN_SERVICE", "CANCELLED"},
    "AWAITING_VERIFICATION": {"CLOSED", "IN_SERVICE"},
    "CLOSED": set(),
    "CANCELLED": set(),
}

OUTCOMES = ("fixed", "partially_fixed", "unresolved", "referred", "declined")


def validate_flow_graph(graph: dict) -> list[str]:
    """发布校验（方案 7.2）：入口存在、分支有终点、无死循环、
    高风险节点不可进入自助操作路径、可执行节点必须有结果选项。"""
    errors: list[str] = []
    if not isinstance(graph, dict):
        return ["流程必须为对象"]
    nodes = graph.get("nodes") or {}
    if not isinstance(nodes, dict) or len(nodes) > 256 or not nodes:
        return ["流程需包含 1～256 个节点"]
    for key, node in nodes.items():
        if not isinstance(key, str) or not isinstance(node, dict):
            return ["节点标识和结构非法"]
        options = node.get("options") or {}
        if not isinstance(options, dict) or any(not isinstance(opt, dict) for opt in options.values()):
            return [f"节点 {key} 的反馈选项结构非法"]
        if not isinstance(node.get("instruction", ""), str):
            return [f"节点 {key} 操作说明必须为文本"]
        if any(opt.get("next") is not None and not isinstance(opt["next"], str) for opt in options.values()):
            return [f"节点 {key} 的跳转目标非法"]
    entry = graph.get("entry")
    if not isinstance(entry, str) or entry not in nodes:
        errors.append("入口节点不存在")
        return errors
    reachable: set[str] = set()
    stack = [entry]
    while stack:
        key = stack.pop()
        if key in reachable:
            continue
        reachable.add(key)
        node = nodes.get(key) or {}
        for opt in (node.get("options") or {}).values():
            nxt = opt.get("next")
            if nxt is None:
                if opt.get("outcome") not in ("resolved", "handoff"):
                    errors.append(f"节点 {key} 存在无终点且无结局的分支")
            elif nxt not in nodes:
                errors.append(f"节点 {key} 指向不存在的节点 {nxt}")
            else:
                stack.append(nxt)
    for key in reachable:
        node = nodes[key]
        if node.get("type") not in ("question", "observe", "action", "verify", "explain", "handoff", "end"):
            errors.append(f"节点 {key} 类型非法: {node.get('type')}")
        if node.get("risk_level") == "high" and node.get("type") in ("action", "observe"):
            errors.append(f"高风险节点 {key} 不允许进入自助操作路径")
        if node.get("type") in ("action", "observe", "verify") and not node.get("options"):
            errors.append(f"可执行节点 {key} 缺少结果选项")
    orphan = set(nodes) - reachable
    if orphan:
        errors.append(f"存在不可达节点: {sorted(orphan)}")
    visiting, finished = set(), set()
    def visit(key):
        if key in visiting:
            errors.append(f"流程存在循环：{key}，请用解释或人工出口替代重复操作")
            return
        if key in finished:
            return
        visiting.add(key)
        for opt in (nodes[key].get("options") or {}).values():
            if opt.get("next") in nodes:
                visit(opt["next"])
        visiting.remove(key)
        finished.add(key)
    visit(entry)
    for key, node in nodes.items():
        if not isinstance(node, dict):
            errors.append(f"节点 {key} 结构非法")
            continue
        if node.get("type") in ("action", "observe", "verify") and (
                not node.get("instruction") or not node.get("expected_observation")):
            errors.append(f"节点 {key} 缺少操作说明或验证观察")
        if node.get("risk_level") not in ("observe", "reversible"):
            errors.append(f"节点 {key} 风险级别不允许自助")
        if node.get("risk_level") == "reversible" and not node.get("rollback"):
            errors.append(f"节点 {key} 缺少回退说明")
        if any(term in node.get("instruction", "").lower() for term in (
                "format c:", "diskpart", "删除分区", "格式化磁盘", "关闭杀毒", "刷写bios", "rm -rf")):
            errors.append(f"节点 {key} 包含人工范围操作")
    return errors
