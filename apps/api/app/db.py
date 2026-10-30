"""SQLite 数据层（标准库实现，零外部依赖）。

设计说明：
- schema 集中在本文件 DDL，启动时 init_db() 幂等创建；
- 所有写事务使用 BEGIN IMMEDIATE，配合原子条件 UPDATE 保证预约名额不超卖；
- 行以 dict 返回；JSON 字段存 TEXT（JSON1 序列化由调用方用 json.dumps/loads 处理）；
- 云上 PostgreSQL 迁移路径：本文件与 SQL 语句集中在服务层，可平滑替换为
  SQLAlchemy/psycopg（见 README「云端部署」）。
"""
from __future__ import annotations

import sqlite3
from contextlib import closing, contextmanager
from pathlib import Path

from .config import get_settings
from .schema_v1 import SCHEMA_V1


class PostgresConnection:
    """兼容现有集中 SQL 的 PostgreSQL 连接，事务使用 advisory lock 串行化业务写入。"""
    def __init__(self, url):
        import psycopg
        from psycopg.rows import dict_row
        self.raw = psycopg.connect(url.replace("postgresql+psycopg://", "postgresql://"), row_factory=dict_row)

    def execute(self, sql, params=()):
        sql = sql.replace("?", "%s").replace("MAX(0,", "GREATEST(0,")
        sql = sql.replace("datetime('now')", "CURRENT_TIMESTAMP::text")
        return self.raw.execute(sql, params) if params else self.raw.execute(sql)

    def executescript(self, script):
        statements = [s.strip() for s in script.split(";") if s.strip()]
        # SQLite 允许先引用后建表，PostgreSQL 要求引用对象已存在。
        tables = [s for s in statements if s.startswith("CREATE TABLE")]
        remaining = list(tables)
        import re
        created = set()
        while remaining:
            ready = [s for s in remaining if set(re.findall(r"REFERENCES (\w+)", s)) <= created]
            if not ready:
                # 外部引用均已由前次 schema 脚本建立。
                ready = remaining[:1]
            for statement in ready:
                self.execute(statement)
                created.add(re.search(r"EXISTS (\w+)", statement).group(1))
                remaining.remove(statement)
        for statement in statements:
            if statement not in tables:
                self.execute(statement)

    def commit(self): self.raw.commit()
    def rollback(self): self.raw.rollback()
    def close(self): self.raw.close()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  phone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_digest TEXT UNIQUE NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'laptop',
  brand_model TEXT NOT NULL DEFAULT '',
  os_family TEXT NOT NULL DEFAULT 'windows',
  os_version TEXT NOT NULL DEFAULT 'Windows 11',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnosis_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_id TEXT REFERENCES devices(id),
  state TEXT NOT NULL DEFAULT 'INTAKE',
  end_reason TEXT,
  symptom_text TEXT NOT NULL DEFAULT '',
  symptom_category TEXT NOT NULL DEFAULT '',
  flow_version_id TEXT,
  current_node TEXT,
  facts TEXT NOT NULL DEFAULT '{}',
  tried_steps TEXT NOT NULL DEFAULT '[]',
  failed_count INTEGER NOT NULL DEFAULT 0,
  risk_flags TEXT NOT NULL DEFAULT '[]',
  handoff_reason TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON diagnosis_sessions(user_id, updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES diagnosis_sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  client_message_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, client_message_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS step_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES diagnosis_sessions(id),
  node_key TEXT NOT NULL,
  flow_version_id TEXT,
  instruction_snapshot TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  created_at TEXT NOT NULL,
  answered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_step_runs_session ON step_runs(session_id);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  reviewer TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES knowledge_documents(id),
  version_no INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  content TEXT NOT NULL,
  applicability TEXT NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'public',
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(document_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_kv_status ON knowledge_versions(status);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES knowledge_versions(id),
  seq INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  embedding TEXT,
  index_version TEXT NOT NULL DEFAULT 'kw-v1'
);

CREATE TABLE IF NOT EXISTS flows (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_versions (
  id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL REFERENCES flows(id),
  version_no INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published',
  graph TEXT NOT NULL,
  symptom_keywords TEXT NOT NULL DEFAULT '[]',
  risk_keywords TEXT NOT NULL DEFAULT '[]',
  source_refs TEXT NOT NULL DEFAULT '[]',
  reviewer TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(flow_id, version_no)
);

CREATE TABLE IF NOT EXISTS service_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  building_room TEXT NOT NULL,
  address_note TEXT NOT NULL DEFAULT '',
  is_open TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS service_events (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES service_locations(id),
  title TEXT NOT NULL,
  service_date TEXT NOT NULL,
  service_scope TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  bring_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_date ON service_events(service_date);

CREATE TABLE IF NOT EXISTS staff_shifts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES service_events(id),
  staff_id TEXT NOT NULL REFERENCES users(id),
  skills TEXT NOT NULL DEFAULT '[]',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_slots (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES service_events(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 2,
  held_count INTEGER NOT NULL DEFAULT 0,
  confirmed_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(event_id, start_at)
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  slot_id TEXT NOT NULL REFERENCES service_slots(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'HELD',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  hold_expires_at TEXT,
  checkin_code TEXT,
  idempotency_key TEXT UNIQUE,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_slot ON appointments(slot_id, status);
CREATE INDEX IF NOT EXISTS idx_appt_ticket ON appointments(ticket_id, status);

CREATE TABLE IF NOT EXISTS scheduling_requests (
  idempotency_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  new_slot_id TEXT NOT NULL REFERENCES service_slots(id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT REFERENCES diagnosis_sessions(id),
  device_id TEXT REFERENCES devices(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'OPEN',
  outcome TEXT,
  outcome_confirmed_by_user TEXT NOT NULL DEFAULT 'no',
  assignee_id TEXT REFERENCES users(id),
  risk_flags TEXT NOT NULL DEFAULT '[]',
  idempotency_key TEXT UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id, status);

CREATE TABLE IF NOT EXISTS handoff_snapshots (
  id TEXT PRIMARY KEY,
  ticket_id TEXT UNIQUE NOT NULL REFERENCES tickets(id),
  device_desc TEXT NOT NULL DEFAULT '',
  user_description TEXT NOT NULL DEFAULT '',
  confirmed_facts TEXT NOT NULL DEFAULT '[]',
  tried_steps TEXT NOT NULL DEFAULT '[]',
  unconfirmed_items TEXT NOT NULL DEFAULT '[]',
  hypotheses TEXT NOT NULL DEFAULT '[]',
  risk_notes TEXT NOT NULL DEFAULT '[]',
  handoff_reason TEXT NOT NULL DEFAULT '',
  confirmed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repair_records (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  staff_id TEXT NOT NULL REFERENCES users(id),
  check_items TEXT NOT NULL DEFAULT '',
  cause TEXT NOT NULL DEFAULT '',
  action_taken TEXT NOT NULL DEFAULT '',
  verification TEXT NOT NULL DEFAULT '',
  conclusion TEXT NOT NULL DEFAULT 'in_progress',
  advice TEXT NOT NULL DEFAULT '',
  is_result_submission TEXT NOT NULL DEFAULT 'no',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_events (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  actor_id TEXT,
  event_type TEXT NOT NULL,
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ticket_events ON ticket_events(ticket_id, created_at);
"""


def _db_path() -> str:
    url = get_settings().database_url
    if url.startswith("sqlite:///"):
        return url.removeprefix("sqlite:///")
    if "://" in url:
        raise RuntimeError("当前版本仅支持 SQLite；请设置 DATABASE_URL=sqlite:///./zhixiu_dev.db")
    return url  # 允许直接给文件路径


def connect() -> sqlite3.Connection:
    url = get_settings().database_url
    if url.startswith(("postgresql://", "postgresql+psycopg://")):
        return PostgresConnection(url)
    path = _db_path()
    if path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.executescript(SCHEMA_V1)
        for table, column, definition in (("users", "email_verified", "INTEGER NOT NULL DEFAULT 0"),
                                          ("service_locations", "workstations", "INTEGER NOT NULL DEFAULT 2"),
                                          ("service_events", "managed", "INTEGER NOT NULL DEFAULT 0")):
            if isinstance(conn, PostgresConnection):
                conn.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}")
            elif column not in {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        from .security import utcnow
        conn.execute("INSERT INTO schema_migrations(version,applied_at) VALUES (?,?) ON CONFLICT(version) DO NOTHING",
                     ("v1.0", utcnow().isoformat()))
        conn.commit()
    finally:
        conn.close()


def _to_dicts(cur: sqlite3.Cursor) -> list[dict]:
    return [dict(r) for r in cur.fetchall()]


def q_all(sql: str, params: tuple = (), conn: sqlite3.Connection | None = None) -> list[dict]:
    if conn is not None:
        return _to_dicts(conn.execute(sql, params))
    with closing(connect()) as c:
        return _to_dicts(c.execute(sql, params))


def q_one(sql: str, params: tuple = (), conn: sqlite3.Connection | None = None) -> dict | None:
    rows = q_all(sql, params, conn)
    return rows[0] if rows else None


def run(sql: str, params: tuple = (), conn: sqlite3.Connection | None = None) -> int:
    """执行写语句。无外部连接时自动提交；事务内使用传入连接。"""
    if conn is not None:
        return conn.execute(sql, params).rowcount
    with closing(connect()) as c:
        cur = c.execute(sql, params)
        c.commit()
        return cur.rowcount


@contextmanager
def tx():
    """写事务：BEGIN IMMEDIATE 立即获取写锁，串行化并发写（防超卖的关键）。"""
    conn = connect()
    try:
        if isinstance(conn, PostgresConnection):
            conn.execute("SELECT pg_advisory_xact_lock(89431527)")
        else:
            conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
