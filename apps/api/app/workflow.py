"""事务内审计、站内通知、Outbox 与持久化限流。"""
import json
import time
from .db import q_one, tx
from .deps import ApiError
from .security import new_id, utcnow


def audit(conn, actor, action, entity_type, entity_id, detail=None):
    conn.execute("INSERT INTO audit_logs VALUES (?,?,?,?,?,?,?)", (
        new_id("aud"), actor, action, entity_type, entity_id,
        json.dumps(detail or {}, ensure_ascii=False), utcnow().isoformat()))


def notify(conn, user_id, title, body, link=""):
    conn.execute("INSERT INTO notifications(id,user_id,title,body,link,created_at) VALUES (?,?,?,?,?,?)",
                 (new_id("ntf"), user_id, title, body, link, utcnow().isoformat()))


def enqueue(conn, kind, payload):
    now = utcnow().isoformat()
    conn.execute("INSERT INTO outbox(id,kind,payload,available_at,created_at) VALUES (?,?,?,?,?)",
                 (new_id("job"), kind, json.dumps(payload, ensure_ascii=False), now, now))


def throttle(key, limit=30, seconds=60):
    window = int(time.time()) // seconds
    from .config import get_settings
    if get_settings().redis_url:
        import redis
        try:
            client = redis.Redis.from_url(get_settings().redis_url, socket_connect_timeout=.3, socket_timeout=.3)
            count = client.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
                                1, f"zhixiu:limit:{window}:{key}", seconds * 2)
            client.close()
            if count > limit:
                raise ApiError(429, "RATE_LIMITED", "操作过于频繁，请稍后再试")
            return
        except (redis.RedisError, OSError):
            pass  # Redis 失败时使用数据库计数，不影响预约事务。
    rejected = False
    with tx() as conn:
        row = q_one("SELECT * FROM rate_limits WHERE key=?", (key,), conn)
        if not row:
            conn.execute("INSERT INTO rate_limits VALUES (?,?,1)", (key, window))
        elif row["window_start"] != window:
            conn.execute("UPDATE rate_limits SET window_start=?,count=1 WHERE key=?", (window, key))
        elif row["count"] >= limit:
            rejected = True
        else:
            conn.execute("UPDATE rate_limits SET count=count+1 WHERE key=?", (key,))
    if rejected:
        raise ApiError(429, "RATE_LIMITED", "操作过于频繁，请稍后再试")
