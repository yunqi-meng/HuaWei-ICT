import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .db import init_db
from .modules.auth.router import router as auth_router
from .modules.diagnosis.router import router as diagnosis_router
from .modules.knowledge.router import router as knowledge_router
from .modules.scheduling.router import router as scheduling_router
from .modules.tickets.router import router as tickets_router
from .modules.platform.router import router as platform_router
from .modules.scheduling.admin import router as scheduling_admin_router
from .modules.tickets.operations import router as operations_router
from .modules.knowledge.editorial import router as editorial_router

logging.basicConfig(level=logging.INFO)
settings = get_settings()

app = FastAPI(title="知修 Zhixiu API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "x-csrf-token"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request.state.request_id = request.headers.get("x-request-id", uuid.uuid4().hex[:12])
    response = await call_next(request)
    response.headers["x-request-id"] = request.state.request_id
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "ERROR", "message": str(exc.detail)}
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": detail.get("code", "ERROR"), "message": detail.get("message", "请求失败"),
                 "request_id": getattr(request.state, "request_id", "")},
    )


@app.on_event("startup")
def startup() -> None:
    if settings.app_env != "dev" and (settings.secret_key.startswith("dev-only") or len(settings.secret_key) < 32 or not settings.cookie_secure):
        raise RuntimeError("生产环境必须设置随机 SECRET_KEY 并启用 COOKIE_SECURE")
    init_db()
    if settings.auto_seed and settings.app_env == "dev":
        from .seed import seed
        seed()


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/api/v1/public-config")
def public_config():
    return {"version": "1.0.0", "demo": settings.app_env == "dev", "model_provider": settings.model_provider}


@app.get("/readyz")
def readyz():
    from .db import q_one
    return {"ok": q_one("SELECT 1 AS n")["n"] == 1, "version": "1.0.0"}


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"code": "INVALID_INPUT", "message": "输入格式或长度不正确，请检查必填项",
                                                "request_id": getattr(request.state, "request_id", "")})


prefix = "/api/v1"
for r in (auth_router, knowledge_router, diagnosis_router, scheduling_router, tickets_router,
          platform_router, scheduling_admin_router, operations_router, editorial_router):
    app.include_router(r, prefix=prefix)
