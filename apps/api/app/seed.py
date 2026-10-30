"""演示种子数据：账号、流程、指南、场地与时段。仅开发/演示环境使用。"""
import json
from datetime import date, timedelta
from pathlib import Path

from .db import init_db, q_one, tx
from .models import validate_flow_graph
from .security import hash_password, new_id, utcnow

FLOWS_DIR = Path(__file__).resolve().parents[3] / "knowledge" / "reviewed-flows"

DEMO_PASSWORD = "Demo1234!"

GUIDES = [
    {
        "key": "network-no-internet", "title": "Wi-Fi 已连接但网页打不开？按顺序排查",
        "category": "network", "estimated_minutes": 10, "difficulty": "easy",
        "content": (
            "## 适用环境\nWindows 11 / Windows 10 笔记本或台式机。\n\n"
            "## 步骤\n1. **确认影响范围**：用手机连接同一 Wi-Fi，看能否上网。\n"
            "2. **关闭系统代理**：设置 → 网络和 Internet → 代理 → 关闭“使用代理服务器”。\n"
            "3. **刷新 DNS 缓存**：管理员终端执行 `ipconfig /flushdns`。\n"
            "4. **确认 DNS 自动获取**：网络适配器属性 → IPv4 → 自动获得 DNS。\n\n"
            "## 回退说明\n以上修改均可在原页面改回。DNS 缓存无需回退。\n\n"
            "## 来源\nMicrosoft 支持：修复 Windows 中的 Wi-Fi 连接问题（审核日期 2026-10-20）。"
        ),
    },
    {
        "key": "audio-no-sound", "title": "外放没声音？先确认输出设备",
        "category": "audio", "estimated_minutes": 8, "difficulty": "easy",
        "content": (
            "## 适用环境\nWindows 11。\n\n"
            "## 步骤\n1. 点击任务栏音量图标，确认当前输出设备是否为“扬声器”。\n"
            "2. 右键音量图标 → 音量合成器，检查是否有应用被单独静音。\n"
            "3. Win + R 输入 `services.msc`，重启“Windows Audio”服务。\n\n"
            "## 何时找人工\n设备列表里完全没有扬声器，或重启服务无效，可能涉及驱动/硬件。"
        ),
    },
    {
        "key": "display-external-monitor", "title": "外接显示器无画面的排查顺序",
        "category": "display", "estimated_minutes": 10, "difficulty": "easy",
        "content": (
            "## 步骤\n1. 检查线缆两端是否插紧，显示器输入源是否选对。\n"
            "2. 按 Win + P 切换“复制”或“扩展”模式。\n"
            "3. 设置 → 系统 → 显示 → 多显示器 → 检测。\n\n"
            "## 注意\n线材或接口有破损、烧蚀痕迹时请不要继续使用，直接到服务点。"
        ),
    },
    {
        "key": "performance-startup-slow", "title": "开机慢：先减启动项，再看磁盘空间",
        "category": "performance", "estimated_minutes": 15, "difficulty": "medium",
        "content": (
            "## 步骤\n1. 任务管理器 → 启动应用，禁用不需要的自启软件（不要禁用显卡/音频/触摸板条目）。\n"
            "2. 此电脑查看 C 盘剩余空间，低于 10% 时：设置 → 系统 → 存储 → 存储感知 + 清理临时文件。\n\n"
            "## 回退说明\n启动项可随时重新启用。"
        ),
    },
    {
        "key": "app-wont-open", "title": "软件打不开/闪退的自助处理",
        "category": "app", "estimated_minutes": 12, "difficulty": "easy",
        "content": (
            "## 步骤\n1. 任务管理器结束该软件全部进程后重开。\n"
            "2. 核对软件官网的系统要求与当前系统版本（设置 → 系统 → 关于）。\n"
            "3. 设置 → 应用 → 已安装的应用 → 高级选项，仅在已保存工作后尝试“修复”；不要自行重置，涉及应用数据请找人工确认。\n\n"
            "## 何时找人工\n报错持续出现或有错误码，请截图并到服务点。"
        ),
    },
]


def _ensure_user(conn, email: str, name: str, roles: list[str]) -> str:
    row = q_one("SELECT id FROM users WHERE email = ?", (email,), conn)
    if row:
        return row["id"]
    uid = new_id("usr")
    conn.execute(
        "INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?,?,?,?,?)",
        (uid, email, hash_password(DEMO_PASSWORD), name, utcnow().isoformat()))
    for r in roles:
        conn.execute("INSERT INTO user_roles (id, user_id, role) VALUES (?,?,?)",
                     (new_id("uro"), uid, r))
    return uid


def _seed_flows(conn) -> None:
    for path in sorted(FLOWS_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        existing = q_one("SELECT id FROM flows WHERE key=?", (data["key"],), conn)
        version_no = data.get("version_no", 1)
        if existing:
            current = q_one("SELECT * FROM flow_versions WHERE flow_id=? AND status='published' ORDER BY version_no DESC LIMIT 1", (existing["id"],), conn)
            if not current or not validate_flow_graph(json.loads(current["graph"])):
                continue
            # 对早期演示库中含循环的旧版执行安全撤回，以新不可变版本修正。
            conn.execute("UPDATE flow_versions SET status='withdrawn' WHERE id=?", (current["id"],))
            version_no = (q_one("SELECT MAX(version_no) AS n FROM flow_versions WHERE flow_id=?", (existing["id"],), conn)["n"] or 0) + 1
        errors = validate_flow_graph(data["graph"])
        if errors:
            raise RuntimeError(f"流程 {data['key']} 校验失败: {errors}")
        fid = existing["id"] if existing else new_id("fl")
        if not existing:
            conn.execute("INSERT INTO flows (id, key, title, category, created_at) VALUES (?,?,?,?,?)",
                         (fid, data["key"], data["title"], data["category"], utcnow().isoformat()))
        conn.execute(
            "INSERT INTO flow_versions (id, flow_id, version_no, status, graph, symptom_keywords, "
            "risk_keywords, source_refs, reviewer, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (new_id("fv"), fid, version_no, "published",
             json.dumps(data["graph"], ensure_ascii=False),
             json.dumps(data.get("symptom_keywords", []), ensure_ascii=False),
             json.dumps(data.get("risk_keywords", []), ensure_ascii=False),
             json.dumps(data.get("source_refs", []), ensure_ascii=False),
             data.get("reviewer", ""), utcnow().isoformat()))


def _seed_guides(conn) -> None:
    now = utcnow().isoformat()
    extra = []
    for path in sorted(FLOWS_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data["key"] in {g["key"] for g in GUIDES}:
            continue
        node = data["graph"]["nodes"][data["graph"]["entry"]]
        extra.append({"key": data["key"], "title": data["title"], "category": data["category"],
                      "estimated_minutes": 8, "difficulty": "easy", "source_url": data["source_refs"][0]["url"],
                      "content": f"## 适用环境\nWindows 11。\n\n## 检查\n{node['instruction']}\n\n## 验证\n{node['expected_observation']}\n\n## 回退\n{node.get('rollback') or '仅查看，无变更'}\n\n## 人工出口\n未恢复或不确定时请停止并转人工。"})
    for g in GUIDES + extra:
        if q_one("SELECT id FROM knowledge_documents WHERE title=?", (g["title"],), conn):
            continue
        did = new_id("kd")
        conn.execute(
            "INSERT INTO knowledge_documents (id, title, category, source_url, reviewer, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (did, g["title"], g["category"], g.get("source_url", "https://support.microsoft.com/zh-cn/windows"),
             "开发演示内容；上线前需人工审核", now))
        vid = new_id("kv")
        applicability = {
            "os_family": "windows", "os_version_range": "10-11", "device_type": "any",
            "symptom_tags": [g["category"]], "risk_level": "observe",
            "estimated_minutes": g["estimated_minutes"], "difficulty": g["difficulty"],
        }
        conn.execute(
            "INSERT INTO knowledge_versions (id, document_id, version_no, status, content, "
            "applicability, visibility, reviewed_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (vid, did, 1, "published", g["content"],
             json.dumps(applicability, ensure_ascii=False), "public", None, now))
        # 按段分块（一条完整操作保留在同一语义单元，方案 9.2）
        for i, block in enumerate([b.strip() for b in g["content"].split("\n\n") if b.strip()]):
            conn.execute(
                "INSERT INTO knowledge_chunks (id, version_id, seq, text, tags) VALUES (?,?,?,?,?)",
                (new_id("kc"), vid, i, block, json.dumps([g["category"]], ensure_ascii=False)))


def _seed_scheduling(conn, staff_id: str) -> None:
    # 修正早期种子把半点时段结束时间写成 14:60 / 15:60 / 16:60 的问题。
    for hour in (14, 15, 16):
        conn.execute("UPDATE service_slots SET end_at=? WHERE end_at=?",
                     (f"{hour + 1}:00", f"{hour}:60"))
    if q_one("SELECT id FROM service_locations LIMIT 1", (), conn):
        return
    now = utcnow().isoformat()
    loc_id = new_id("loc")
    conn.execute(
        "INSERT INTO service_locations (id, name, building_room, address_note) VALUES (?,?,?,?)",
        (loc_id, "大学生活动中心电脑义诊点", "活动中心 2 楼 203 室",
         "从东门进入上二楼右转，门口有“电脑义诊”指示牌"))
    today = date.today()
    days_ahead = (5 - today.weekday()) % 7 or 7  # 下一个周六
    for week in range(2):
        d = today + timedelta(days=days_ahead + week * 7)
        eid = new_id("evt")
        conn.execute(
            "INSERT INTO service_events (id, location_id, title, service_date, service_scope, "
            "status, bring_note, created_at) VALUES (?,?,?,?,?,'published',?,?)",
            (eid, loc_id, f"校园电脑义诊（{d.isoformat()}）", d.isoformat(),
             "常见软件与系统问题初诊；不含数据恢复与拆机",
             "请携带电源适配器；如需重装系统请提前备份数据", now))
        conn.execute(
            "INSERT INTO staff_shifts (id, event_id, staff_id, skills, start_at, end_at) "
            "VALUES (?,?,?,?,?,?)",
            (new_id("shf"), eid, staff_id,
             json.dumps(["network", "audio", "display", "performance", "app"]), "14:00", "17:00"))
        for start in ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30"]:
            hh, mm = start.split(":")
            total_minutes = int(hh) * 60 + int(mm) + 30
            end = f"{total_minutes // 60:02d}:{total_minutes % 60:02d}"
            conn.execute(
                "INSERT INTO service_slots (id, event_id, start_at, end_at, capacity) "
                "VALUES (?,?,?,?,?)",
                (new_id("slt"), eid, start, end, 2))


def seed() -> None:
    from .config import get_settings
    if get_settings().app_env != "dev":
        raise RuntimeError("演示种子仅允许在 APP_ENV=dev 中执行")
    init_db()
    with tx() as conn:
        user_id = _ensure_user(conn, "user@demo.local", "演示用户", ["user"])
        staff_id = _ensure_user(conn, "staff@demo.local", "维修志愿者小王", ["staff"])
        _ensure_user(conn, "admin@demo.local", "义诊管理员", ["admin", "staff"])
        _ensure_user(conn, "reviewer@demo.local", "知识审核员", ["reviewer"])
        _ensure_user(conn, "editor@demo.local", "知识编辑员", ["reviewer"])
        _ensure_user(conn, "dispatcher@demo.local", "义诊调度员", ["dispatcher"])
        conn.execute("UPDATE users SET email_verified=1 WHERE email IN (?,?,?,?,?,?)", (
            "user@demo.local", "staff@demo.local", "admin@demo.local", "reviewer@demo.local", "editor@demo.local", "dispatcher@demo.local"))
        if not q_one("SELECT id FROM devices WHERE owner_id = ? LIMIT 1", (user_id,), conn):
            conn.execute(
                "INSERT INTO devices (id, owner_id, kind, brand_model, os_family, os_version, "
                "created_at) VALUES (?,?,?,?,?,?,?)",
                (new_id("dev"), user_id, "laptop", "联想小新 Air 14", "windows",
                 "Windows 11 23H2", utcnow().isoformat()))
        _seed_flows(conn)
        _seed_guides(conn)
        _seed_scheduling(conn, staff_id)


if __name__ == "__main__":
    seed()
    print("seed done")
