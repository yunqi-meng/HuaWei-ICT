"""Source-backed catalog shared with the UI. Never infer measurements from TDP."""
import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path

CATALOG_PATH = Path(__file__).resolve().parents[4] / "web/src/data/hardwareCatalog.json"
_CATALOG = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
CPUS = [c for c in _CATALOG["chips"] if c["type"] == "cpu"]
GPUS = [c for c in _CATALOG["chips"] if c["type"] == "gpu"]
METRICS = {"cpu": ("gb7_single", "gb7_multi"), "gpu": ("gb7_opencl",)}


@lru_cache(maxsize=1)
def _catalog_at_version(mtime_ns):
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["chips"]


def get_all_chips():
    return deepcopy(_catalog_at_version(CATALOG_PATH.stat().st_mtime_ns))


def get_chip(chip_id: str):
    return next((c for c in get_all_chips() if c["id"] == chip_id), None)


def get_rankings(chip_type: str = "cpu", metric: str = "gb7_multi"):
    if metric not in METRICS.get(chip_type, ()):
        return []
    items = [c for c in get_all_chips() if c["type"] == chip_type
             and isinstance(c.get(metric), (int, float)) and c[metric] > 0
             and c.get("benchmark_source")]
    items.sort(key=lambda c: c[metric], reverse=True)
    return [{"rank": i + 1, **c} for i, c in enumerate(items)]


def compare_chips(chip_ids: list[str]):
    return [chip for cid in chip_ids if (chip := get_chip(cid))]
