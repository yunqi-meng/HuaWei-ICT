"""模型适配层：华为云 MaaS（对话 / 向量化 / 重排序）。

设计约束（方案 11.2）：
- 可配置、可替换，型号不写死在业务代码；
- 未配置密钥时 enabled=False，诊断引擎以规则 + 审核流程运行；
- 服务端调用，密钥不回显到前端；
- 检索材料视为不可信数据，模型输出必须经服务器结构校验后才可使用。
"""
from __future__ import annotations

import logging
import time
from functools import lru_cache
from threading import BoundedSemaphore

import httpx

from ...config import get_settings

logger = logging.getLogger(__name__)


def record_call(provider, model, operation, status, started, usage=None):
    try:
        from ...db import run
        from ...security import new_id, utcnow
        usage = usage or {}
        run("INSERT INTO model_runs VALUES (?,?,?,?,?,?,?,?,?)", (
            new_id("mdl"), operation, provider, model, status, int((time.monotonic()-started)*1000),
            int(usage.get("prompt_tokens", 0)), int(usage.get("completion_tokens", 0)), utcnow().isoformat()))
    except Exception:
        logger.warning("Model telemetry unavailable")


class MaaSClient:
    def __init__(self) -> None:
        s = get_settings()
        self._enabled = bool(s.maas_enabled and s.maas_base_url and s.maas_api_key)
        self._base = s.maas_base_url.rstrip("/").removesuffix("/v1")
        self._key = s.maas_api_key
        self._chat_model = s.maas_chat_model
        self._embedding_model = s.maas_embedding_model
        self._rerank_model = s.maas_rerank_model
        self._provider = s.model_provider
        self._timeout = httpx.Timeout(30.0, connect=10.0)
        self._slots = BoundedSemaphore(10)

    @property
    def enabled(self) -> bool:
        return self._enabled

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._key}", "Content-Type": "application/json"}

    def chat(self, messages: list[dict], *, max_tokens: int = 800) -> str | None:
        """对话补全（OpenAI 兼容接口）。失败返回 None，由调用方降级。"""
        if not self._enabled or not self._chat_model:
            return None
        if not self._slots.acquire(blocking=False):
            return None
        started = time.monotonic()
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(
                    f"{self._base}/v1/chat/completions",
                    headers=self._headers(),
                    json={"model": self._chat_model, "messages": messages,
                          "max_tokens": max_tokens, "temperature": 0.2,
                          **({"thinking": {"type": "disabled"}, "response_format": {"type": "json_object"}}
                             if self._provider == "deepseek" else {})},
                )
                resp.raise_for_status()
                data = resp.json()
                record_call(self._provider, self._chat_model, "chat", "success", started, data.get("usage"))
                return data["choices"][0]["message"]["content"]
        except Exception as exc:  # noqa: BLE001 降级不抛出模型原始异常（防密钥泄漏）
            logger.warning("MaaS chat failed: %s", type(exc).__name__)
            record_call(self._provider, self._chat_model, "chat", type(exc).__name__, started)
            return None
        finally:
            self._slots.release()

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        if not self._enabled or not self._embedding_model:
            return None
        if not self._slots.acquire(blocking=False):
            return None
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(
                    f"{self._base}/v1/embeddings",
                    headers=self._headers(),
                    json={"model": self._embedding_model, "input": texts},
                )
                resp.raise_for_status()
                return [d["embedding"] for d in resp.json()["data"]]
        except Exception as exc:  # noqa: BLE001
            logger.warning("MaaS embed failed: %s", type(exc).__name__)
            return None
        finally:
            self._slots.release()

    def rerank(self, query: str, documents: list[str], top_n: int = 5) -> list[int] | None:
        """返回按相关性排序的文档下标。不可用时调用方走融合排序。"""
        if not self._enabled or not self._rerank_model:
            return None
        if not self._slots.acquire(blocking=False):
            return None
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(
                    f"{self._base}/v1/rerank",
                    headers=self._headers(),
                    json={"model": self._rerank_model, "query": query,
                          "documents": documents, "top_n": top_n},
                )
                resp.raise_for_status()
                return [r["index"] for r in resp.json()["results"]]
        except Exception as exc:  # noqa: BLE001
            logger.warning("MaaS rerank failed: %s", type(exc).__name__)
            return None
        finally:
            self._slots.release()


@lru_cache
def get_llm() -> MaaSClient:
    return MaaSClient()
