"""硬件数据库 API — 芯片排行、查询、对比、能效曲线"""

from typing import Literal

from fastapi import APIRouter, Query

from ...deps import bad_request, not_found

from .data import get_all_chips, get_chip, get_rankings, compare_chips, METRICS

router = APIRouter(tags=["hardware"])


@router.get("/hardware/chips")
def list_chips(
    type: Literal["cpu", "gpu"] | None = Query(None, description="cpu 或 gpu"),
    brand: str | None = Query(None),
    tier: str | None = Query(None),
    q: str | None = Query(None, description="搜索关键词"),
):
    items = get_all_chips()
    if type:
        items = [c for c in items if c["type"] == type]
    if brand:
        items = [c for c in items if c["brand"].lower() == brand.lower()]
    if tier:
        items = [c for c in items if c["tier"] == tier]
    if q:
        ql = q.lower()
        items = [c for c in items if ql in c["name"].lower() or ql in c["brand"].lower() or ql in c["id"]]
    return {"items": items, "total": len(items)}


@router.get("/hardware/chips/{chip_id}")
def chip_detail(chip_id: str):
    chip = get_chip(chip_id)
    if not chip:
        raise not_found("芯片不存在")
    return chip


@router.get("/hardware/rankings")
def rankings(
    type: Literal["cpu", "gpu"] = Query("cpu", description="cpu 或 gpu"),
    metric: str = Query("gb7_multi", description="排名指标（Geekbench 7）"),
):
    if metric not in METRICS[type]:
        metric = "gb7_multi" if type == "cpu" else "gb7_opencl"
    return {"items": get_rankings(type, metric), "metric": metric, "type": type}


@router.post("/hardware/compare")
def compare(chip_ids: list[str]):
    chip_ids = list(dict.fromkeys(chip_ids))
    if len(chip_ids) < 2:
        raise bad_request("至少选择两个不同的芯片进行对比")
    if len(chip_ids) > 6:
        raise bad_request("最多对比 6 个芯片")
    items = compare_chips(chip_ids)
    if len(items) != len(chip_ids):
        raise not_found("部分芯片不存在，请重新选择")
    if len({chip["type"] for chip in items}) != 1:
        raise bad_request("CPU 与 GPU 的性能指标不同，请选择同类型芯片对比")
    return {"items": items}
