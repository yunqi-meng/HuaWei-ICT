"""认证与账号 API：注册、登录、登出、当前用户、设备管理。"""
from datetime import timedelta

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from ...config import get_settings
from ...db import q_all, q_one, run
from ...deps import (SESSION_COOKIE, ApiError, csrf_protect, get_current_user,
                     user_roles)
from ...security import (hash_password, new_csrf_token, new_id,
                         new_session_token, utcnow, verify_password)

router = APIRouter(tags=["auth"])


class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)


class LoginIn(BaseModel):
    email: str
    password: str


class DeviceIn(BaseModel):
    kind: str = Field(default="laptop", pattern="^(laptop|desktop|other)$")
    brand_model: str = Field(default="", max_length=120)
    os_family: str = Field(default="windows", max_length=30)
    os_version: str = Field(default="Windows 11", max_length=60)


def _issue_session(response: Response, user: dict) -> dict:
    settings = get_settings()
    token, digest = new_session_token()
    csrf = new_csrf_token(digest)
    run(
        "INSERT INTO auth_sessions (id, user_id, token_digest, csrf_token, expires_at, created_at) "
        "VALUES (?,?,?,?,?,?)",
        (new_id("ses"), user["id"], digest, csrf,
         (utcnow() + timedelta(hours=settings.session_ttl_hours)).isoformat(),
         utcnow().isoformat()))
    response.set_cookie(
        SESSION_COOKIE, token, httponly=True, samesite="lax",
        secure=settings.cookie_secure, max_age=settings.session_ttl_hours * 3600,
    )
    return {**me_view(user), "csrf_token": csrf}


def me_view(user: dict) -> dict:
    return {
        "id": user["id"], "email": user["email"], "display_name": user["display_name"],
        "roles": sorted(user_roles(user["id"])),
        "email_verified": bool(user.get("email_verified")),
        "verification_required": get_settings().require_email_verification,
    }


@router.post("/auth/register")
def register(payload: RegisterIn, response: Response, request: Request):
    import re
    from ...deps import bad_request
    from ...db import tx
    from ...workflow import throttle
    throttle("registration:" + (request.client.host if request.client else "local"), 30, 3600)
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", payload.email) or len(payload.password.encode()) > 72:
        raise bad_request("请填写有效邮箱，密码 UTF-8 长度不得超过 72 字节")
    email = payload.email.lower()
    if q_one("SELECT id FROM users WHERE email = ?", (email,)):
        raise ApiError(409, "EMAIL_TAKEN", "该邮箱已注册")
    uid = new_id("usr")
    hashed = hash_password(payload.password)
    with tx() as conn:
        if q_one("SELECT id FROM users WHERE email=?", (email,), conn):
            raise ApiError(409, "EMAIL_TAKEN", "该邮箱已注册")
        conn.execute("INSERT INTO users (id,email,password_hash,display_name,created_at) VALUES (?,?,?,?,?)",
                     (uid, email, hashed, payload.display_name, utcnow().isoformat()))
        conn.execute("INSERT INTO user_roles VALUES (?,?,?)", (new_id("uro"), uid, "user"))
    return _issue_session(response, q_one("SELECT * FROM users WHERE id = ?", (uid,)))


@router.post("/auth/login")
def login(payload: LoginIn, response: Response, request: Request):
    from ...workflow import throttle
    from ...security import token_digest
    throttle("login:" + token_digest((request.client.host if request.client else "local") + payload.email.lower()), 10, 300)
    user = q_one("SELECT * FROM users WHERE email = ?", (payload.email.lower(),))
    if not user or len(payload.password.encode()) > 72 or not verify_password(payload.password, user["password_hash"]):
        raise ApiError(401, "BAD_CREDENTIALS", "邮箱或密码不正确")
    if not user["is_active"]:
        raise ApiError(403, "ACCOUNT_DISABLED", "账号已停用")
    return _issue_session(response, user)


@router.post("/auth/logout", dependencies=[Depends(csrf_protect)])
def logout(response: Response, request: Request, user: dict = Depends(get_current_user)):
    run("DELETE FROM auth_sessions WHERE token_digest=?", (request.state.session_digest,))
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@router.get("/auth/me")
def me(user: dict = Depends(get_current_user)):
    return me_view(user)


@router.get("/auth/csrf")
def csrf(request: Request, user: dict = Depends(get_current_user)):
    """前端启动时获取当前会话的 CSRF token。"""
    sess = q_one(
        "SELECT csrf_token FROM auth_sessions WHERE token_digest=?",
        (request.state.session_digest,))
    return {"csrf_token": sess["csrf_token"] if sess else None}


@router.get("/devices")
def list_devices(user: dict = Depends(get_current_user)):
    return q_all(
        "SELECT id, kind, brand_model, os_family, os_version FROM devices WHERE owner_id = ?",
        (user["id"],))


@router.post("/devices", dependencies=[Depends(csrf_protect)])
def create_device(payload: DeviceIn, user: dict = Depends(get_current_user)):
    did = new_id("dev")
    run("INSERT INTO devices (id, owner_id, kind, brand_model, os_family, os_version, created_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (did, user["id"], payload.kind, payload.brand_model, payload.os_family,
         payload.os_version, utcnow().isoformat()))
    return {"id": did, **payload.model_dump()}
