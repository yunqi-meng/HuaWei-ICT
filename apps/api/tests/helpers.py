"""测试公共装置：独立临时数据库，服务层与 ASGI HTTP 测试共用。

运行方式：cd apps/api && python -m unittest discover -s tests -v
"""
import json
import os
import sys
import tempfile
import uuid
from pathlib import Path

import bcrypt

API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))

_TMP_DB = Path(tempfile.gettempdir()) / f"zhixiu_test_{os.getpid()}.db"
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_TMP_DB}"
os.environ["APP_ENV"] = "dev"
os.environ["AUTO_SEED"] = "true"
os.environ["MAAS_ENABLED"] = "false"  # 回归测试不得消耗真实模型额度。

from app.db import q_all, q_one, run  # noqa: E402
from app.seed import DEMO_PASSWORD, seed  # noqa: E402
from app.security import new_id, utcnow  # noqa: E402

seed()  # 建表 + 种子（幂等）

# 测试用快速密码散列（低轮数，仅测试库）
_TEST_HASH = bcrypt.hashpw(b"Test1234!", bcrypt.gensalt(rounds=4)).decode()


def make_user(roles: tuple[str, ...] = ("user",)) -> str:
    uid = new_id("usr")
    run("INSERT INTO users (id, email, password_hash, display_name, created_at) "
        "VALUES (?,?,?,?,?)",
        (uid, f"t_{uuid.uuid4().hex[:8]}@test.local", _TEST_HASH, "测试用户",
         utcnow().isoformat()))
    for r in roles:
        run("INSERT INTO user_roles (id, user_id, role) VALUES (?,?,?)", (new_id("uro"), uid, r))
    return uid


def demo_user_id(email: str) -> str:
    return q_one("SELECT id FROM users WHERE email = ?", (email,))["id"]


def get_slot(event_index: int = 0, slot_index: int = 0) -> dict:
    from app.modules.scheduling import service as svc
    # 固定使用种子活动，避免其他接口测试创建的活动改变下标。
    events = q_all("SELECT id FROM service_events WHERE title LIKE '校园电脑义诊（%' ORDER BY service_date")
    return svc.list_slots(events[event_index]["id"])[slot_index]


def make_ticket(user_id: str, title: str = "测试工单", **extra) -> dict:
    from app.modules.tickets import service as svc
    payload = {"title": title, "description": "测试描述",
               "session_id": None, "device_id": None,
               "handoff_confirmed": False, "idempotency_key": None,
               "category": "", **extra}
    return svc.create_ticket(user={"id": user_id}, payload=payload)


def book(user_id: str, ticket_id: str, slot_id: str, idem: str | None = None) -> dict:
    from app.modules.scheduling import service as svc
    hold = svc.create_hold(user_id=user_id, slot_id=slot_id, ticket_id=ticket_id,
                           idempotency_key=idem)
    return svc.confirm_booking(user_id=user_id, appointment_id=hold["id"],
                               contact_name="测试用户", contact_phone="13800000000",
                               idempotency_key=None)


def session_json(sid: str) -> dict:
    from app.modules.diagnosis import engine as diag
    return diag.get_session(sid)


__all__ = ["DEMO_PASSWORD", "make_user", "demo_user_id", "get_slot", "make_ticket",
           "book", "session_json", "json"]
