"""统一错误与依赖注入：当前用户、角色校验、CSRF。"""
from fastapi import Depends, HTTPException, Request, status

from .db import q_all, q_one
from .security import token_digest, utcnow

SESSION_COOKIE = "zx_session"
CSRF_HEADER = "x-csrf-token"


class ApiError(HTTPException):
    """统一错误格式：{code, message, request_id}。"""

    def __init__(self, http_status: int, code: str, message: str):
        super().__init__(status_code=http_status, detail={"code": code, "message": message})


def not_found(msg: str = "资源不存在") -> ApiError:
    return ApiError(status.HTTP_404_NOT_FOUND, "NOT_FOUND", msg)


def forbidden(msg: str = "没有访问权限") -> ApiError:
    return ApiError(status.HTTP_403_FORBIDDEN, "FORBIDDEN", msg)


def conflict(msg: str) -> ApiError:
    return ApiError(status.HTTP_409_CONFLICT, "CONFLICT", msg)


def bad_request(msg: str) -> ApiError:
    return ApiError(status.HTTP_400_BAD_REQUEST, "BAD_REQUEST", msg)


def user_roles(user_id: str, conn=None) -> set[str]:
    rows = q_all("SELECT role FROM user_roles WHERE user_id = ?", (user_id,), conn)
    return {r["role"] for r in rows}


def get_current_user(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", "请先登录")
    sess = q_one("SELECT * FROM auth_sessions WHERE token_digest = ?", (token_digest(token),))
    if not sess or sess["expires_at"] < utcnow().isoformat():
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", "登录已过期，请重新登录")
    user = q_one("SELECT * FROM users WHERE id = ?", (sess["user_id"],))
    if not user or not user["is_active"]:
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", "账号不可用")
    request.state.session_digest = sess["token_digest"]
    return user


def require_roles(*roles: str):
    def checker(user: dict = Depends(get_current_user)) -> dict:
        if not user_roles(user["id"]).intersection(roles):
            raise forbidden()
        return user

    return checker


def verify_csrf(request: Request) -> None:
    """状态修改接口的双提交 CSRF 校验（Cookie 会话 + 自定义头）。"""
    token = request.headers.get(CSRF_HEADER)
    sess_digest = getattr(request.state, "session_digest", None)
    if not token or not sess_digest:
        raise ApiError(status.HTTP_403_FORBIDDEN, "CSRF_FAILED", "缺少安全校验，请刷新页面后重试")
    from .security import verify_csrf_token

    if not verify_csrf_token(sess_digest, token):
        raise ApiError(status.HTTP_403_FORBIDDEN, "CSRF_FAILED", "安全校验失败，请刷新页面后重试")


def csrf_protect(request: Request, user: dict = Depends(get_current_user)) -> None:
    """供写接口使用的依赖：确保身份解析（写入 session_digest）后再校验 CSRF。"""
    verify_csrf(request)


def require_verified(user: dict = Depends(get_current_user)):
    from .config import get_settings
    if get_settings().require_email_verification and not user.get("email_verified"):
        raise ApiError(403, "EMAIL_UNVERIFIED", "请先在账号页面验证邮箱")
    return user
