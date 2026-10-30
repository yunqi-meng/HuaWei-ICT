"""配置：环境变量 + 可选 .env 文件（不依赖 pydantic-settings）。"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


def _load_dotenv() -> None:
    for candidate in (Path(".env"), Path("../../.env"), Path("../../../.env")):
        if candidate.exists():
            for line in candidate.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


class Settings:
    def __init__(self) -> None:
        _load_dotenv()
        e = os.environ.get
        self.app_env = e("APP_ENV", "dev")
        self.database_url = e("DATABASE_URL", "sqlite:///./zhixiu_dev.db")
        self.redis_url = e("REDIS_URL", "")
        self.secret_key = e("SECRET_KEY", "dev-only-change-me-please-32bytes-min")
        self.session_ttl_hours = int(e("SESSION_TTL_HOURS", "72"))
        self.cors_origins = e("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        self.cookie_secure = e("COOKIE_SECURE", "false").lower() == "true"

        self.maas_enabled = e("MAAS_ENABLED", "false").lower() == "true"
        self.maas_base_url = e("MAAS_BASE_URL", "")
        self.maas_api_key = e("MAAS_API_KEY", "")
        self.maas_chat_model = e("MAAS_CHAT_MODEL", "")
        self.maas_embedding_model = e("MAAS_EMBEDDING_MODEL", "")
        self.maas_rerank_model = e("MAAS_RERANK_MODEL", "")
        self.model_provider = e("MODEL_PROVIDER", "openai-compatible")

        self.obs_enabled = e("OBS_ENABLED", "false").lower() == "true"
        self.upload_dir = e("UPLOAD_DIR", "./uploads")
        self.obs_endpoint = e("OBS_ENDPOINT", "")
        self.obs_bucket = e("OBS_BUCKET", "")
        self.obs_ak = e("OBS_AK", "")
        self.obs_sk = e("OBS_SK", "")
        self.require_email_verification = e("REQUIRE_EMAIL_VERIFICATION", "false" if self.app_env == "dev" else "true").lower() == "true"
        self.smtp_host = e("SMTP_HOST", "")
        self.smtp_port = int(e("SMTP_PORT", "587"))
        self.smtp_user = e("SMTP_USER", "")
        self.smtp_password = e("SMTP_PASSWORD", "")
        self.smtp_from = e("SMTP_FROM", "")
        self.smtp_starttls = e("SMTP_STARTTLS", "true").lower() == "true"
        self.auto_seed = e("AUTO_SEED", "true").lower() == "true"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
