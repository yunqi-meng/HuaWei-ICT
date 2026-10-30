"""数据库 Outbox Worker：python -m app.worker；--once 只处理当前批次。"""
import argparse
import json
import smtplib
import time
from datetime import timedelta
from email.message import EmailMessage
from .config import get_settings
from .db import init_db, q_one, run, tx
from .security import utcnow


def process_one():
    now = utcnow()
    with tx() as conn:
        job = q_one("SELECT * FROM outbox WHERE status IN ('pending','processing') AND available_at<=? "
                     "ORDER BY created_at LIMIT 1", (now.isoformat(),), conn)
        if not job:
            return False
        conn.execute("UPDATE outbox SET status='processing',attempts=attempts+1,available_at=? WHERE id=?",
                     ((now + timedelta(minutes=5)).isoformat(), job["id"]))
    try:
        data = json.loads(job["payload"])
        if job["kind"] == "email":
            s = get_settings()
            if not s.smtp_host or not s.smtp_from:
                raise RuntimeError("SMTP_NOT_CONFIGURED")
            message = EmailMessage()
            message["From"], message["To"], message["Subject"] = s.smtp_from, data["to"], data["subject"]
            message.set_content(data["body"])
            with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
                if s.smtp_starttls:
                    import ssl
                    smtp.starttls(context=ssl.create_default_context())
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password)
                smtp.send_message(message)
        elif job["kind"] == "delete_image":
            from .modules.platform.router import delete_image
            delete_image(data["key"])
        elif job["kind"] == "index_knowledge":
            from .modules.knowledge.retrieval import build_index
            build_index(data["version_id"])
        else:
            raise RuntimeError("UNKNOWN_JOB")
        run("UPDATE outbox SET status='done',last_error='',payload='{}' WHERE id=?", (job["id"],))
    except Exception as exc:
        attempts = job["attempts"] + 1
        run("UPDATE outbox SET status=?,last_error=?,available_at=? WHERE id=?", (
            "failed" if attempts >= 5 else "pending", type(exc).__name__,
            (utcnow() + timedelta(seconds=min(600, 2 ** attempts * 10))).isoformat(), job["id"]))
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    init_db()
    while True:
        from .modules.scheduling.service import expire_holds
        expire_holds()
        if not process_one():
            if args.once:
                break
            time.sleep(2)


if __name__ == "__main__":
    main()
