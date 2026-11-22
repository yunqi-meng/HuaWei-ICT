"""Public motherboard and chipset reference data imported from supplied workbooks."""
import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Query

from ...deps import bad_request, not_found

CATALOG_PATH = Path(__file__).resolve().parents[4] / "web/src/data/motherboardCatalog.json"
router = APIRouter(prefix="/hardware", tags=["motherboards"])


@lru_cache(maxsize=1)
def _at_version(mtime_ns):
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def catalog():
    return _at_version(CATALOG_PATH.stat().st_mtime_ns)


@router.get("/motherboards/overview")
def overview():
    data = catalog()
    boards, chipsets = data["motherboards"], data["chipsets"]
    return {"total": len(boards), "chipset_count": len(chipsets), "preview_count": sum(c["is_preview"] for c in chipsets),
            "with_specs": sum(b["has_specs"] for b in boards), "with_images": sum(bool(b["image"]) for b in boards),
            "brands": sorted({b["brand"] for b in boards}), "sockets": sorted({c["socket"] for c in chipsets}),
            "source": deepcopy(data["source"]), "checked_at": data["checked_at"]}


@router.get("/chipsets")
def list_chipsets(vendor: Literal["Intel", "AMD"] | None = None, socket: str | None = None,
                  q: str | None = None, include_preview: bool = False):
    items = catalog()["chipsets"]
    if not include_preview:
        items = [c for c in items if not c["is_preview"]]
    if vendor:
        items = [c for c in items if c["vendor"] == vendor]
    if socket:
        items = [c for c in items if c["socket"] == socket]
    if q:
        query = q.strip().casefold()
        items = [c for c in items if query in " ".join(str(c[k] or "") for k in ("name", "socket", "vendor", "memory_support")).casefold()]
    return {"items": deepcopy(items), "total": len(items)}


@router.get("/motherboards")
def list_motherboards(q: str | None = None, vendor: Literal["Intel", "AMD"] | None = None,
                      chipset: str | None = None, brand: str | None = None, socket: str | None = None,
                      memory: Literal["DDR3", "DDR4", "DDR5"] | None = None, has_specs: bool | None = None,
                      offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100)):
    items = catalog()["motherboards"]
    for field, value in (("vendor", vendor), ("chipset", chipset), ("brand", brand), ("socket", socket)):
        if value:
            items = [b for b in items if b[field].casefold() == value.casefold()]
    if memory:
        items = [b for b in items if memory in b["memory_types"]]
    if has_specs is not None:
        items = [b for b in items if b["has_specs"] == has_specs]
    if q:
        query = q.strip().casefold()
        items = [b for b in items if query in " ".join(str(b[k] or "") for k in ("name", "brand", "chipset", "socket", "memory")).casefold()]
    return {"items": deepcopy(items[offset:offset + limit]), "total": len(items)}


@router.get("/motherboards/{board_id}")
def board_detail(board_id: str):
    data = catalog()
    board = next((b for b in data["motherboards"] if b["id"] == board_id), None)
    if board is None:
        raise not_found("主板型号不存在")
    chipset = next(c for c in data["chipsets"] if c["id"] == board["chipset_id"])
    return {**deepcopy(board), "chipset_detail": deepcopy(chipset), "source": deepcopy(data["source"])}


@router.post("/motherboards/compare")
def compare(board_ids: list[str]):
    ids = list(dict.fromkeys(board_ids))
    if not 2 <= len(ids) <= 4:
        raise bad_request("请选择 2 至 4 款不同主板进行对比")
    by_id = {b["id"]: b for b in catalog()["motherboards"]}
    if any(board_id not in by_id for board_id in ids):
        raise not_found("部分主板不存在，请重新选择")
    return {"items": deepcopy([by_id[board_id] for board_id in ids])}
