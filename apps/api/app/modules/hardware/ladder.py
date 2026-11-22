"""Workbook-backed full CPU/GPU catalog; missing scores never enter rankings."""
import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Query

from ...deps import bad_request, not_found

LADDER_PATH = Path(__file__).resolve().parents[4] / "web/src/data/ladderCatalog.json"

router = APIRouter(tags=["ladder"])

CPU_METRICS = ("cpuz_single", "cpuz_multi", "cpuz_composite")
GPU_METRICS = ("tdmark_ts",)


@lru_cache(maxsize=1)
def _catalog_at_version(mtime_ns):
    return json.loads(LADDER_PATH.read_text(encoding="utf-8"))


def _catalog():
    return _catalog_at_version(LADDER_PATH.stat().st_mtime_ns)


def _cpus():
    return _catalog()["cpus"]


def _gpus():
    return _catalog()["gpus"]


@router.get("/ladder/overview")
def overview():
    data = _catalog()
    cpus, gpus = data["cpus"], data["gpus"]
    return {
        "checked_at": data["checked_at"],
        "origin": data["origin"],
        "cpu_source": data["cpu_source"],
        "gpu_source": data["gpu_source"],
        "cpu_count": len(cpus),
        "gpu_count": len(gpus),
        "cpu_ranked": sum(c["has_benchmark"] for c in cpus),
        "gpu_with_scores": sum(g["has_benchmark"] for g in gpus),
        "gpu_missing_scores": sum(not g["has_benchmark"] for g in gpus),
        "sources": data["sources"],
    }


@router.get("/ladder/cpus")
def list_cpus(
    platform: str | None = Query(None, description="desktop 或 mobile"),
    brand: str | None = Query(None),
    q: str | None = Query(None, description="搜索关键词"),
    ranked_only: bool = Query(False),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
):
    items = _cpus()
    if ranked_only:
        items = [c for c in items if c["has_benchmark"]]
    if platform:
        items = [c for c in items if c["platform"] == platform]
    if brand:
        items = [c for c in items if c["brand"].lower() == brand.lower()]
    if q:
        ql = q.lower()
        items = [c for c in items if ql in c["name"].lower() or ql in c["brand"].lower()]
    return {"items": deepcopy(items[offset:offset + limit]), "total": len(items)}


@router.get("/ladder/cpus/{cpu_id}")
def cpu_detail(cpu_id: str):
    cpu = next((c for c in _cpus() if c["id"] == cpu_id), None)
    if not cpu:
        raise not_found("CPU 不存在")
    return deepcopy(cpu)


@router.get("/ladder/gpus")
def list_gpus(
    platform: str | None = Query(None, description="desktop / integrated / mobile"),
    brand: str | None = Query(None),
    tier: str | None = Query(None),
    q: str | None = Query(None, description="搜索关键词"),
    measured_only: bool = Query(False, description="仅看表内有 Time Spy 参考成绩的型号"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
):
    items = _gpus()
    if platform:
        items = [g for g in items if g["platform"] == platform]
    if brand:
        items = [g for g in items if g["brand"].lower() == brand.lower()]
    if tier:
        items = [g for g in items if g["tier"] == tier]
    if measured_only:
        items = [g for g in items if g["has_benchmark"]]
    if q:
        ql = q.lower()
        items = [g for g in items if ql in g["name"].lower() or ql in g["brand"].lower()]
    return {"items": deepcopy(items[offset:offset + limit]), "total": len(items)}


@router.get("/ladder/gpus/{gpu_id}")
def gpu_detail(gpu_id: str):
    gpu = next((g for g in _gpus() if g["id"] == gpu_id), None)
    if not gpu:
        raise not_found("显卡不存在")
    return deepcopy(gpu)


@router.get("/ladder/rankings")
def rankings(
    type: str = Query("cpu", description="cpu 或 gpu"),
    metric: str | None = Query(None),
    platform: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    default_metric = "cpuz_composite" if type == "cpu" else "tdmark_ts"
    metric = metric or default_metric
    allowed = CPU_METRICS if type == "cpu" else GPU_METRICS
    if metric not in allowed:
        raise bad_request(f"不支持的指标：{metric}")
    if type == "cpu":
        items = _cpus()
        if platform:
            items = [c for c in items if c["platform"] == platform]
        rows = [c for c in items if c["has_benchmark"] and isinstance(c.get(metric), (int, float)) and c[metric] > 0]
    elif type == "gpu":
        items = _gpus()
        if platform:
            items = [g for g in items if g["platform"] == platform]
        # 理论性能分与 Time Spy 分属不同口径，缺失跑分不参与。
        rows = [g for g in items if g["has_benchmark"] and not g.get("ts_estimated")
                and isinstance(g.get(metric), (int, float)) and g[metric] > 0]
    else:
        raise bad_request("type 只能是 cpu 或 gpu")
    rows = sorted(rows, key=lambda r: r[metric], reverse=True)[:limit]
    return {"metric": metric, "type": type, "items": deepcopy(rows)}


@router.post("/ladder/compare")
def ladder_compare(chip_ids: list[str]):
    chip_ids = list(dict.fromkeys(chip_ids))
    if len(chip_ids) < 2:
        raise bad_request("至少选择两个不同的型号进行对比")
    if len(chip_ids) > 6:
        raise bad_request("最多对比 6 个型号")
    items = []
    for cid in chip_ids:
        chip = next((c for c in _cpus() if c["id"] == cid), None) or \
               next((g for g in _gpus() if g["id"] == cid), None)
        if chip:
            items.append(chip)
    if len(items) != len(chip_ids):
        raise not_found("部分型号不存在，请重新选择")
    if len({c["type"] for c in items}) != 1:
        raise bad_request("CPU 与 GPU 的性能指标不同，请选择同类型型号对比")
    return {"items": deepcopy(items)}
