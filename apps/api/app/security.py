import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt

from .config import get_settings


def new_id(prefix: str) -> str:
    """不可猜测 ID：前缀 + uuid4 hex。"""
    return f"{prefix}_{uuid.uuid4().hex[:24]}"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def new_session_token() -> tuple[str, str]:
    """返回 (明文 token, 存储用 sha256 摘要)。数据库只存摘要。"""
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).hexdigest()


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_checkin_code() -> str:
    """一次性签到码（短时有效，服务端单次核销）。"""
    return secrets.token_urlsafe(8)


def new_csrf_token(session_digest: str) -> str:
    settings = get_settings()
    msg = f"{session_digest}:{secrets.token_urlsafe(8)}"
    sig = hmac.new(settings.secret_key.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}:{sig}"


def verify_csrf_token(session_digest: str, token: str) -> bool:
    settings = get_settings()
    try:
        msg, sig = token.rsplit(":", 1)
    except ValueError:
        return False
    if not msg.startswith(session_digest + ":"):
        return False
    expect = hmac.new(settings.secret_key.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expect, sig)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def hold_expiry(minutes: int = 5) -> datetime:
    return utcnow() + timedelta(minutes=minutes)
