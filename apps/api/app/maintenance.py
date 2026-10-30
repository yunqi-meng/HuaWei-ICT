"""可移植快照备份与空库恢复；不会覆盖已有业务数据。"""
import argparse
import json
import re
import shutil
from pathlib import Path
from .config import get_settings
from .db import SCHEMA, PostgresConnection, connect, init_db, q_all, q_one, tx
from .schema_v1 import SCHEMA_V1
from .security import utcnow

EXCLUDED = {"auth_sessions", "verification_codes", "rate_limits", "outbox", "schema_migrations"}


def ordered_tables():
    statements = re.findall(r"CREATE TABLE IF NOT EXISTS (\w+)\s*\((.*?)\);", SCHEMA + SCHEMA_V1, re.S)
    pending = {table: set(re.findall(r"REFERENCES (\w+)", body)) for table, body in statements}
    order = []
    while pending:
        ready = [table for table, deps in pending.items() if deps <= set(order)]
        if not ready:
            raise RuntimeError("循环外键，无法确定恢复顺序")
        for table in ready:
            order.append(table)
            del pending[table]
    return [t for t in order if t not in EXCLUDED]


def backup(output):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    conn = connect()
    try:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ" if isinstance(conn, PostgresConnection) else "BEGIN")
        snapshot = {"format": "zhixiu-v1", "created_at": utcnow().isoformat(),
                    "tables": {table: q_all(f"SELECT * FROM {table}", (), conn) for table in ordered_tables()}}
        with (output / "snapshot.json").open("x", encoding="utf-8") as handle:
            json.dump(snapshot, handle, ensure_ascii=False, indent=2)
    finally:
        conn.close()
    settings = get_settings()
    if not settings.obs_enabled and Path(settings.upload_dir).exists():
        shutil.copytree(settings.upload_dir, output / "files")
    return output


def restore(source):
    source = Path(source).resolve()
    snapshot = json.loads((source / "snapshot.json").read_text(encoding="utf-8"))
    if snapshot.get("format") != "zhixiu-v1" or not isinstance(snapshot.get("tables"), dict):
        raise ValueError("不是受支持的备份")
    init_db()
    with tx() as conn:
        if any(q_one(f"SELECT COUNT(*) AS n FROM {table}", (), conn)["n"] for table in ordered_tables()):
            raise RuntimeError("恢复目标必须为空库，拒绝覆盖现有数据")
        for table in ordered_tables():
            for row in snapshot["tables"].get(table, []):
                # 字段名只取当前可信数据库 schema，禁止备份内容注入 SQL。
                known = q_all("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=?", (table,), conn) if isinstance(conn, PostgresConnection) else []
                columns = {r["column_name"] for r in known} if known else {r["name"] for r in q_all(f"PRAGMA table_info({table})", (), conn)}
                fields = [name for name in row if name in columns]
                conn.execute(f"INSERT INTO {table} ({','.join(fields)}) VALUES ({','.join('?' for _ in fields)})", tuple(row[f] for f in fields))
    # 附件备份不自动覆盖文件；恢复说明要求将 files 作为新 UPLOAD_DIR。


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["backup", "restore"])
    parser.add_argument("path")
    args = parser.parse_args()
    if args.action == "backup":
        print(backup(args.path))
    else:
        restore(args.path)
        print("恢复完成。登录会话、验证码、限流与待发送任务未恢复。请按说明恢复附件目录。")


if __name__ == "__main__":
    main()
