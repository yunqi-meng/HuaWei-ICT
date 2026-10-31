"""硬件数据库 API — 芯片排行、查询、对比、能效曲线"""

from fastapi import APIRouter, Query

from .data import get_all_chips, get_chip, get_rankings, compare_chips

router = APIRouter(tags=["hardware"])


@router.get("/hardware/chips")
def list_chips(
    type: str | None = Query(None, description="cpu 或 gpu"),
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
        return {"code": "NOT_FOUND", "message": "芯片不存在"}
    return chip


@router.get("/hardware/rankings")
def rankings(
    type: str = Query("cpu", description="cpu 或 gpu"),
    metric: str = Query("gb6_multi", description="排名指标"),
):
    valid_metrics_cpu = ["gb6_single", "gb6_multi", "cb_r23_single", "cb_r23_multi"]
    valid_metrics_gpu = ["ts_score", "sn_score", "sn_dx12"]
    if type == "cpu" and metric not in valid_metrics_cpu:
        metric = "gb6_multi"
    if type == "gpu" and metric not in valid_metrics_gpu:
        metric = "ts_score"
    return {"items": get_rankings(type, metric), "metric": metric, "type": type}


@router.post("/hardware/compare")
def compare(chip_ids: list[str]):
    if len(chip_ids) < 2:
        return {"code": "INVALID_INPUT", "message": "至少选择两个芯片进行对比"}
    if len(chip_ids) > 6:
        return {"code": "INVALID_INPUT", "message": "最多对比 6 个芯片"}
    items = compare_chips(chip_ids)
    return {"items": items}
