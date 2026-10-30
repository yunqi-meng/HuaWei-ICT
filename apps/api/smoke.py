"""HTTP 冒烟脚本：启动 API 后验证真实网络链路。

用法：先启动 API（uvicorn app.main:app --reload），再执行 python smoke.py
"""
import sys
import os
from uuid import uuid4

import httpx

BASE = os.environ.get("API_BASE_URL", "http://localhost:8000/api/v1")


def main() -> int:
    c = httpx.Client(base_url=BASE)
    run_key = uuid4().hex
    # 健康检查
    assert c.get(BASE.removesuffix("/api/v1") + "/healthz").json()["ok"]

    # 登录演示账号
    r = c.post("/auth/login", json={"email": "user@demo.local", "password": "Demo1234!"})
    assert r.status_code == 200, r.text
    csrf = r.json()["csrf_token"]
    h = {"x-csrf-token": csrf}

    # 指南
    guides = c.get("/guides").json()
    assert len(guides) >= 5

    # 诊断会话
    s = c.post("/diagnosis-sessions", json={"symptom_text": "Wi-Fi 连上但网页打不开"},
               headers=h).json()
    if s["state"] == "CLARIFY":
        s = c.post(f"/diagnosis-sessions/{s['id']}/messages", json={"option_key": "os_win11"}, headers=h).json()
    assert s["state"] == "GUIDE", s
    s = c.post(f"/diagnosis-sessions/{s['id']}/messages",
               json={"option_key": "only_this", "client_message_id": "smoke-1"}, headers=h).json()
    assert s["state"] == "GUIDE"
    s = c.post(f"/diagnosis-sessions/{s['id']}/messages",
               json={"option_key": "worked", "client_message_id": "smoke-2"}, headers=h).json()
    if s["state"] == "VERIFY":
        s = c.post(f"/diagnosis-sessions/{s['id']}/messages", json={"option_key": "verify_yes"}, headers=h).json()
    assert s["state"] == "RESOLVED"

    # 高风险分流
    s = c.post("/diagnosis-sessions", json={"symptom_text": "电池鼓包了"}, headers=h).json()
    assert s["state"] == "HANDOFF" and "鼓包" in s["risk_flags"]

    # 工单 + 预约
    t = c.post("/tickets", json={"title": "冒烟测试工单", "idempotency_key": f"smoke-ticket-{run_key}"},
               headers=h).json()
    events = c.get("/service-events").json()
    slots = c.get("/service-slots", params={"event_id": events[0]["id"]}).json()
    slot = next(s for s in slots if s["remaining"] > 0)
    hold = c.post("/appointment-holds",
                  json={"slot_id": slot["id"], "ticket_id": t["id"],
                        "idempotency_key": f"smoke-hold-{run_key}"}, headers=h).json()
    appt = c.post(f"/appointments/{hold['id']}/confirm",
                  json={"contact_name": "冒烟", "contact_phone": "13800000000",
                        "idempotency_key": "smoke-c1"}, headers=h).json()
    assert appt["status"] == "CONFIRMED" and appt.get("checkin_code")

    # 管理员派单 + 指标
    admin = httpx.Client(base_url=BASE)
    r = admin.post("/auth/login", json={"email": "admin@demo.local", "password": "Demo1234!"})
    ah = {"x-csrf-token": r.json()["csrf_token"]}
    staff = admin.get("/admin/staff-list", headers=ah).json()[0]
    r = admin.post(f"/admin/tickets/{t['id']}/assign",
                   json={"assignee_id": staff["id"], "version": t["version"]}, headers=ah)
    assert r.status_code == 200, r.text
    metrics = admin.get("/admin/metrics", headers=ah).json()
    assert "tickets_by_status" in metrics

    # 不占用后续演示名额；工单取消同步释放已确认预约。
    cancelled = c.post(f"/tickets/{t['id']}/cancel", headers=h)
    assert cancelled.status_code == 200, cancelled.text
    assert "active_appointment" not in cancelled.json()
    c.close()
    admin.close()

    print("SMOKE OK：指南 / 排障 / 风险门禁 / 工单 / 预约 / 派单 / 指标 全链路通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
