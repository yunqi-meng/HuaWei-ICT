"""Offline catalog/source/asset/flow checks; optional read-only SQLite consistency audit.

Run: python tools/audit_project_data.py --database apps/api/zhixiu_dev.db
Does not contact external services or print user content. Source facts need human review.
"""
import argparse
import hashlib
import json
import math
import re
import sqlite3
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "apps/web/src/data"
PUBLIC = ROOT / "apps/web/public"
sys.path.insert(0, str(ROOT / "apps/api"))
from app.models import validate_flow_graph


def audit(database=None):
    errors = []
    def check(condition, message):
        if not condition:
            errors.append(message)
    def https(url):
        parsed = urlparse(url or "")
        return parsed.scheme == "https" and bool(parsed.hostname) and not parsed.username
    catalog = json.loads((DATA / "hardwareCatalog.json").read_text(encoding="utf-8"))
    chips = catalog["chips"]
    check(len({c["id"] for c in chips}) == len(chips), "重复芯片 ID")
    benchmarked = 0
    for c in chips:
        key = c["id"]
        check(https(c["spec_source"]["url"]), f"{key}: 规格来源 URL 非法")
        check(c["checked_at"] == catalog["checked_at"], f"{key}: 核对日期不同步")
        check(not c["efficiency_points"], f"{key}: 新增曲线必须先扩展测量来源与条件校验")
        check(not any(k in c for k in ("gb6_multi", "cb_r23_multi", "ts_score", "gpu_score")), f"{key}: 遗留无来源跑分")
        scores = [c.get(k) for k in ("gb7_single", "gb7_multi", "gb7_opencl")]
        if any(v is not None for v in scores):
            benchmarked += 1
            check(c["benchmark_source"] and urlparse(c["benchmark_source"]["url"]).hostname == "browser.geekbench.com", f"{key}: 缺基准来源")
            check(all(v is None or (type(v) in (int,float) and v > 0) for v in scores), f"{key}: 非法成绩")
        check(c["type"] == "gpu" or c["gb7_opencl"] is None, f"{key}: CPU 不得混入 GPU 成绩")
        check(c["type"] == "cpu" or (c["gb7_multi"] is None and c["gb7_single"] is None), f"{key}: GPU 不得混入 CPU 成绩")
    quality = json.loads((DATA / "buildQuality.json").read_text(encoding="utf-8"))
    images = json.loads((DATA / "productImages.json").read_text(encoding="utf-8"))
    photos = {i["path"]: i for i in images}
    check(len({c["id"] for c in quality}) == len(quality), "重复做工条目 ID")
    hashes = []
    for i in images:
        path = (PUBLIC / i["path"].lstrip("/")).resolve()
        check(path.is_relative_to(PUBLIC.resolve()) and path.is_file(), f"图片缺失或越界: {i['path']}")
        if path.is_file():
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            check(digest == i["sha256"], f"图片与已核对版本不同: {i['path']}")
            hashes.append(digest)
        check(https(i["source_url"]) and https(i["product_url"]), f"图片来源缺失: {i['path']}")
    check(len(set(hashes)) == len(hashes), "不同产品复用了完全相同的照片")
    for c in quality:
        check(not any(k in c for k in ("score", "price", "warranty")), f"{c['id']}: 不应恢复无依据评分、价格或保修")
        check(not c["facts"] or https(c["source_url"]), f"{c['id']}: 规格缺少来源")
        check(not c["image"] or c["image"] in photos, f"{c['id']}: 图片未登记")
        if c["image"] in photos:
            check(photos[c["image"]]["product_id"] == c["id"], f"{c['id']}: 图片型号登记不符")
    flows = list((ROOT / "knowledge/reviewed-flows").glob("*.json"))
    for p in flows:
        flow = json.loads(p.read_text(encoding="utf-8"))
        check(not validate_flow_graph(flow["graph"]), f"{p.name}: 流程结构非法")
        check(all(https(s["url"]) and urlparse(s["url"]).hostname == "support.microsoft.com" and urlparse(s["url"]).path != "/zh-cn/windows" for s in flow["source_refs"]), f"{p.name}: 缺少对应支持文章")
    report = {"chips":len(chips),"benchmarked_models":benchmarked,"quality_products":len(quality),
              "products_pending":sum(not c["facts"] for c in quality),"verified_photos":len(images),"flows":len(flows)}
    ladder_path = DATA / "ladderCatalog.json"
    if ladder_path.exists():
        ladder = json.loads(ladder_path.read_text(encoding="utf-8"))
        check(ladder["schema_version"] == 2, "工作簿硬件目录版本不符")
        for kind, metric_keys in (("cpus", ("cpuz_single", "cpuz_multi", "cpuz_composite")), ("gpus", ("tdmark_ts",))):
            records = ladder[kind]
            check(len({c["id"] for c in records}) == len(records), kind + ": 重复型号 ID")
            check(len({c["source_ref"]["row"] for c in records}) == len(records), kind + ": 重复来源行")
            for chip in records:
                check(all(chip[k] is None or (type(chip[k]) in (int, float) and math.isfinite(chip[k]) and chip[k] > 0) for k in metric_keys), chip["id"] + ": 非法参考成绩")
                check(chip["has_benchmark"] == all(chip[k] is not None for k in metric_keys), chip["id"] + ": 成绩状态不匹配")
                check(chip["source_ref"]["sheet"] == "全量参数库" and chip["source_ref"]["row"] >= 5, chip["id"] + ": 来源行非法")
                if kind == "gpus":
                    check(not chip["ts_estimated"] and "bus_width" not in chip and "bus_gbps" not in chip, chip["id"] + ": 禁止估算 Time Spy 或混用带宽单位")
        report.update(workbook_cpus=len(ladder["cpus"]), workbook_gpus=len(ladder["gpus"]),
                      workbook_cpu_scores=sum(c["has_benchmark"] for c in ladder["cpus"]),
                      workbook_gpu_scores=sum(c["has_benchmark"] for c in ladder["gpus"]))
    board_path = DATA / "motherboardCatalog.json"
    if board_path.exists():
        boards = json.loads(board_path.read_text(encoding="utf-8"))
        check(boards["schema_version"] == 1, "主板目录版本不符")
        by_id = {c["id"]: c for c in boards["chipsets"]}
        check(len(by_id) == len(boards["chipsets"]), "重复芯片组 ID")
        products = boards["motherboards"]
        check(len({b["id"] for b in products}) == len(products), "重复主板 ID")
        for board in products:
            chip = by_id.get(board["chipset_id"])
            check(chip and board["chipset"] in chip["codes"] and board["socket"] == chip["socket"], board["id"] + ": 芯片组关联错误")
            check(not board["is_preview"], board["id"] + ": 预告占位行不得变成主板产品")
            check(board["reference_price_cny"] is None or board["reference_price_cny"] > 0, board["id"] + ": 非法历史参考价")
            if board["image"]:
                photo = (PUBLIC / board["image"].lstrip("/")).resolve()
                check(photo.is_relative_to(PUBLIC.resolve()) and photo.is_file(), board["id"] + ": 图片缺失或越界")
                if photo.is_relative_to(PUBLIC.resolve()) and photo.is_file():
                    check(hashlib.sha256(photo.read_bytes()).hexdigest() == board["image_sha256"], board["id"] + ": 图片与导入时不一致")
        report.update(workbook_motherboards=len(products), workbook_chipsets=len(by_id),
                      workbook_board_images=sum(bool(b["image"]) for b in products),
                      preview_chipsets=sum(c["is_preview"] for c in boards["chipsets"]))
    socpk_path = DATA / "socpkCatalog.json"
    if socpk_path.exists():
        socpk = json.loads(socpk_path.read_text(encoding="utf-8"))
        check(socpk["schema_version"] == 1, "SOCPK 快照格式改变，需要重新核对")
        check(len({p["slug"] for p in socpk["pages"]}) == len(socpk["pages"]), "SOCPK 重复图表")
        curve_points = 0
        for page in socpk["pages"]:
            tag = "SOCPK " + page["slug"]
            check(page["source_url"] == "https://www.socpk.com/chart/" + page["slug"], tag + ": 来源不符")
            check(bool(page["version"]) and bool(re.fullmatch(r"[a-f0-9]{64}", page["payload_sha256"])), tag + ": 缺少版本或原始响应摘要")
            check(len({r["id"] for r in page["series"]}) == len(page["series"]), tag + ": 重复来源 ID")
            for row in page["series"]:
                points = row["points"]
                if page["type"] == "line-chart":
                    curve_points += len(points)
                    check(all(len(p) == 2 and all(isinstance(v,(int,float)) and math.isfinite(v) for v in p) and p[0]>0 and p[1]>=0 for p in points), tag + ": 非法曲线点")
                    check(all(a[0]<b[0] for a,b in zip(points,points[1:])), tag + ": 功耗点未严格递增")
                    if page["slug"] == "mobile-soc-efficiency-gb7":
                        check(row["meta"].get("suite") in ("GB6","GB7"), tag + ": 未识别的测试版本，禁止直接混用")
                    if page["slug"] == "mobile-soc-spec26":
                        check(row["meta"].get("suite") in ("INT","FP") and row["meta"].get("coreName"), tag + ": 未区分负载或核心")
                else:
                    check(all(isinstance(v,(int,float)) and math.isfinite(v) and v>=0 for v in points), tag + ": 非法榜单成绩")
        report.update(socpk_pages=len(socpk["pages"]),socpk_source_series=sum(len(p["series"]) for p in socpk["pages"]),socpk_source_curve_points=curve_points)
    if database:
        path = Path(database).resolve()
        with sqlite3.connect(f"{path.as_uri()}?mode=ro",uri=True) as conn:
            check([r[0] for r in conn.execute("PRAGMA integrity_check")] == ["ok"], "SQLite 完整性检查失败")
            check(not conn.execute("PRAGMA foreign_key_check").fetchall(), "SQLite 外键关联异常")
            slots = conn.execute("SELECT start_at,end_at,capacity,held_count,confirmed_count FROM service_slots").fetchall()
            valid_time = lambda t: bool(re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d",t))
            check(all(valid_time(a) and valid_time(b) and a<b and 0<=h and 0<=c and h+c<=cap for a,b,cap,h,c in slots), "预约时段或名额计数异常")
            mismatch = conn.execute("SELECT COUNT(*) FROM service_slots s WHERE s.held_count != (SELECT COUNT(*) FROM appointments a WHERE a.slot_id=s.id AND a.status='HELD') OR s.confirmed_count != (SELECT COUNT(*) FROM appointments a WHERE a.slot_id=s.id AND a.status IN ('CONFIRMED','CHECKED_IN'))").fetchone()[0]
            check(mismatch == 0, "预约名额与预约记录不一致")
            report["database"] = "read-only integrity / foreign keys / slot counters checked"
    report["errors"] = errors
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path)
    args = parser.parse_args()
    result = audit(args.database)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(bool(result["errors"]))
