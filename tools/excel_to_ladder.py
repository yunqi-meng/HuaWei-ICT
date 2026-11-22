"""Offline workbook importer. Reads sources without modifying them.

Install tools/requirements.txt; application runtime only consumes generated JSON.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import posixpath
import re
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile

import openpyxl
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MISSING = {"", "—", "-", "暂无数据", "未公布", "未知", "N/A"}
TIER_MAP = {"旗舰": "flagship", "高端": "high-end", "中性能": "mid-range", "低性能": "low-end", "入门": "budget"}
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
      "a": "http://schemas.openxmlformats.org/drawingml/2006/main"}


def text(value):
    value = str(value).strip() if value is not None else ""
    return None if value in MISSING else value


def num(value):
    if isinstance(value, bool) or text(value) is None:
        return None
    try:
        result = float(value)
    except (ValueError, TypeError):
        return None
    if not math.isfinite(result):
        return None
    return int(result) if result.is_integer() else result


def nominal(value):
    """Extract a declared base value; preserve parentheses in a separate raw field."""
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(?:[（(].*[）)])?", text(value) or "")
    return num(match[1]) if match else None


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-") or "item"


def unique_id(name, scope, seen):
    result = slug(name)
    if result in seen:
        result += "-" + slug(scope)
    if result in seen:
        raise ValueError(f"Duplicate model: {name} / {scope}")
    seen.add(result)
    return result


def safe_url(value):
    value = text(value)
    parts = urlsplit(value or "")
    return value if parts.scheme in ("http", "https") and parts.hostname and not parts.username else None


def source_ref(path, sheet, row):
    return {"file": path.name, "sheet": sheet, "row": row}


def source_info(path, source_date):
    return {"file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "source_date": source_date, "verification": "user_provided"}


def sheet_date(path, sheet):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        header = " ".join(str(v) for r in wb[sheet].iter_rows(max_row=3, values_only=True) for v in r if v is not None)
        match = re.search(r"\b20\d{2}-\d{2}(?:-\d{2})?\b", header)
        return match[0] if match else "未标注"
    finally:
        wb.close()


def brand_of(name, url=None):
    if "amd.com" in (url or "") or "_amd_" in (url or ""):
        return "AMD"
    if "intel.com" in (url or "") or "_intel_" in (url or ""):
        return "Intel"
    if re.search(r"ryzen|athlon|sempron|phenom|opteron|turion|duron|^(?:a[468]|a10|a12|fx|e[12])-", name.lower()):
        return "AMD"
    if re.search(r"core|pentium|celeron|xeon|atom", name.lower()):
        return "Intel"
    return "Apple" if name.lower().startswith(("apple", "m1", "m2", "m3", "m4")) else "其他"


def convert_cpu(path, checked_at):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        refs = {(text(r[0]), text(r[1])): r for r in wb["数据来源"].iter_rows(min_row=5, values_only=True)}
        result, seen = [], set()
        for row, r in enumerate(wb["全量参数库"].iter_rows(min_row=5, values_only=True), 5):
            name = text(r[0])
            if not name:
                continue
            kind = text(r[1]) or ""
            platform = "mobile" if "Mobile" in kind or "移动" in kind else "desktop"
            ref = refs.get((name, kind), ())
            single, multi, composite = (num(r[i]) for i in (7, 8, 9))
            ranked = all(v is not None and v > 0 for v in (single, multi, composite))
            result.append({
                "id": unique_id(name, platform, seen), "name": name, "brand": brand_of(name, text(r[14])),
                "type": "cpu", "platform": platform, "cores": nominal(r[2]), "cores_text": text(r[2]),
                "threads": num(r[3]), "base_clock": num(r[4]), "boost_clock": num(r[5]),
                "tdp": nominal(r[6]), "power_text": text(r[6]), "cpuz_single": single, "cpuz_multi": multi,
                "cpuz_composite": composite, "cpu_mark": num(r[10]), "has_benchmark": ranked,
                "ranking_status": text(r[11]), "audit_note": text(r[12]), "reference_tier": text(r[13]),
                "spec_source_url": safe_url(r[14]), "coverage_source": text(r[15]),
                "checked_at": checked_at, "source_ref": source_ref(path, "全量参数库", row),
                "benchmark_source": {"title": text(ref[5]) if ref else "表内 CPU-Z 参考成绩",
                                     "url": safe_url(ref[8]) if ref else None} if ranked else None,
            })
        return sorted(result, key=lambda c: (not c["has_benchmark"], -(c["cpuz_composite"] or 0), c["name"]))
    finally:
        wb.close()


def convert_gpu(path, checked_at):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        result, seen = [], set()
        for row, r in enumerate(wb["全量参数库"].iter_rows(min_row=5, values_only=True), 5):
            name = text(r[0])
            if not name:
                continue
            kind = text(r[2]) or ""
            ts = num(r[7])
            has_score = ts is not None and ts > 0
            result.append({
                "id": unique_id(name, kind, seen), "name": name, "brand": text(r[1]) or "其他", "type": "gpu",
                "platform": {"Desktop": "desktop", "Workstation": "workstation", "Integrated": "integrated", "Mobile": "mobile"}[kind],
                "arch": text(r[3]), "tier": TIER_MAP.get(text(r[4]), "other"), "tier_label": text(r[4]),
                "perf_x": num(r[5]), "theory_score": num(r[6]), "tdmark_ts": ts if has_score else None,
                "ts_estimated": False, "has_benchmark": has_score, "tdp": num(r[8]), "power_text": text(r[8]),
                "process_nm": num(r[9]), "year": num(r[10]), "vram_gb": num(r[11]), "vram_text": text(r[11]),
                "vram_type": text(r[12]), "memory_bandwidth_gbs": num(r[13]), "memory_speed_gbps": num(r[14]),
                "boost_mhz": num(r[15]), "note": text(r[16]), "checked_at": checked_at,
                "source_ref": source_ref(path, "全量参数库", row),
                "benchmark_source": {"title": "表内 Time Spy 显卡分参考", "url": None} if has_score else None,
            })
        return sorted(result, key=lambda c: (not c["has_benchmark"], -(c["tdmark_ts"] or 0), c["name"]))
    finally:
        wb.close()


def zip_target(base, target):
    return target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join(posixpath.dirname(base), target))


def relationships(archive, part):
    rel_path = posixpath.join(posixpath.dirname(part), "_rels", posixpath.basename(part) + ".rels")
    if rel_path not in archive.namelist():
        return {}
    return {r.attrib["Id"]: zip_target(part, r.attrib["Target"])
            for r in ET.fromstring(archive.read(rel_path)) if r.attrib.get("TargetMode") != "External"}


def board_images(path):
    """Map embedded thumbnails to their actual sheet rows using OOXML anchors."""
    result = {}
    with ZipFile(path) as archive:
        workbook = "xl/workbook.xml"
        rels = relationships(archive, workbook)
        sheet = next(s for s in ET.fromstring(archive.read(workbook)).find("s:sheets", NS) if s.attrib["name"] == "品牌主板明细")
        part = rels[sheet.attrib[f"{{{NS['r']}}}id"]]
        sheet_rels = relationships(archive, part)
        for drawing in ET.fromstring(archive.read(part)).findall("s:drawing", NS):
            drawing_part = sheet_rels[drawing.attrib[f"{{{NS['r']}}}id"]]
            drawing_rels = relationships(archive, drawing_part)
            for anchor in ET.fromstring(archive.read(drawing_part)):
                start, blip = anchor.find("xdr:from", NS), anchor.find(".//a:blip", NS)
                if start is None or blip is None or start.findtext("xdr:col", namespaces=NS) != "10":
                    continue
                row = int(start.findtext("xdr:row", namespaces=NS)) + 1
                target = drawing_rels[blip.attrib[f"{{{NS['r']}}}embed"]]
                data = archive.read(target)
                with Image.open(io.BytesIO(data)) as image:
                    if image.format not in ("PNG", "JPEG", "WEBP"):
                        raise ValueError(f"Unsupported image: {target}")
                    image.verify()
                if row in result:
                    raise ValueError(f"Multiple images at row {row}")
                result[row] = (data, Path(target).suffix.lower())
    return result


def convert_motherboards(path, checked_at, image_dir):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        chipsets, by_code = [], {}
        for row, r in enumerate(wb["芯片组总表"].iter_rows(min_row=2, values_only=True), 2):
            if not text(r[1]):
                continue
            codes = [c.strip() for c in str(r[1]).split("/")]
            item = dict(zip(("vendor", "name", "socket", "release_text", "positioning", "chipset_power", "typical_vrm",
                             "memory_support", "cpu_pcie", "chipset_pcie", "sata", "usb", "overclock", "note"), map(text, r[:14])))
            item.update(id=f"{slug(r[0])}-{slug(r[1])}", codes=codes,
                        is_preview="2026年末" in (text(r[3]) or "") or "爆料" in (text(r[13]) or ""),
                        source_ref=source_ref(path, "芯片组总表", row))
            chipsets.append(item)
            for code in codes:
                if code in by_code:
                    raise ValueError(f"Duplicate chipset: {code}")
                by_code[code] = item
        images = board_images(path)
        products, seen, matched = [], set(), set()
        for row, r in enumerate(wb["品牌主板明细"].iter_rows(min_row=2, values_only=True), 2):
            name = text(r[2])
            if not name:
                continue
            chipset = by_code[text(r[0])]
            key = "|".join(str(v) for v in r[:3])
            board_id = "board-" + slug(r[0]) + "-" + hashlib.sha256(key.encode()).hexdigest()[:12]
            if board_id in seen:
                raise ValueError(f"Duplicate motherboard: {key}")
            seen.add(board_id)
            image_path, image_sha = None, None
            if row in images:
                data, ext = images[row]
                image_sha = hashlib.sha256(data).hexdigest()
                filename = image_sha[:24] + ext
                image_dir.mkdir(parents=True, exist_ok=True)
                (image_dir / filename).write_bytes(data)
                image_path = "/images/motherboards/workbook/" + filename
                matched.add(row)
            memory, price = text(r[5]), num(r[9])
            products.append({
                "id": board_id, "name": name, "brand": text(r[1]), "chipset": text(r[0]), "chipset_id": chipset["id"],
                "vendor": chipset["vendor"], "socket": chipset["socket"], "form_factor": text(r[3]), "vrm": text(r[4]),
                "memory": memory, "memory_types": sorted(set(re.findall(r"DDR[345]", memory or ""))),
                "dimensions": text(r[6]), "power_connectors": text(r[7]), "audio": text(r[8]),
                "reference_price_cny": price if price is not None and price > 0 else None,
                "price_note": None if price is not None else text(r[9]), "image": image_path, "image_sha256": image_sha,
                "note": text(r[11]), "is_preview": chipset["is_preview"], "has_specs": any(text(r[i]) for i in range(3, 9)),
                "checked_at": checked_at, "source_ref": source_ref(path, "品牌主板明细", row),
            })
        if matched != set(images):
            raise ValueError("Embedded images without matching products")
        notes = [{"label": text(r[0]), "text": text(r[1])} for r in wb["说明与来源"].iter_rows(values_only=True) if text(r[1])]
        period = next((n["text"] for n in notes if n["label"] == "【时间口径】"), "")
        match = re.search(r"(20\d{2})年(\d{1,2})月", period)
        source_date = f"{match[1]}-{int(match[2]):02d}" if match else "未标注"
        return {"schema_version": 1, "checked_at": checked_at, "source": source_info(path, source_date),
                "source_notes": notes, "chipsets": chipsets, "motherboards": products}
    finally:
        wb.close()


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cpu", required=True, type=Path)
    p.add_argument("--gpu", required=True, type=Path)
    p.add_argument("--motherboards", type=Path)
    p.add_argument("--checked-at", default=date.today().isoformat(), type=lambda v: date.fromisoformat(v).isoformat())
    p.add_argument("--output-dir", type=Path, default=ROOT / "apps/web/src/data")
    p.add_argument("--image-dir", type=Path, default=ROOT / "apps/web/public/images/motherboards/workbook")
    args = p.parse_args(argv)
    cpus, gpus = convert_cpu(args.cpu, args.checked_at), convert_gpu(args.gpu, args.checked_at)
    data = {"schema_version": 2, "checked_at": args.checked_at,
            "origin": "用户提供的 CPU / GPU 综合全世代工作簿，未逐条在线核验",
            "cpu_source": "表内 CPU-Z 参考成绩；无成绩型号仅提供参数，CPU Mark 单列",
            "gpu_source": "表内 Time Spy 显卡分参考；理论性能分独立保留，不补齐缺失跑分",
            "sources": {"cpu": source_info(args.cpu, sheet_date(args.cpu, "混合-综合")),
                        "gpu": source_info(args.gpu, sheet_date(args.gpu, "天梯-综合"))},
            "cpus": cpus, "gpus": gpus}
    outputs = {"ladderCatalog.json": data}
    if args.motherboards:
        outputs["motherboardCatalog.json"] = convert_motherboards(args.motherboards, args.checked_at, args.image_dir)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, content in outputs.items():
        (args.output_dir / name).write_text(json.dumps(content, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({"cpus": len(cpus), "cpus_with_scores": sum(c["has_benchmark"] for c in cpus),
                      "gpus": len(gpus), "gpus_with_scores": sum(g["has_benchmark"] for g in gpus),
                      **({"motherboards": len(outputs["motherboardCatalog.json"]["motherboards"]),
                          "chipsets": len(outputs["motherboardCatalog.json"]["chipsets"]),
                          "product_images": sum(bool(b["image"]) for b in outputs["motherboardCatalog.json"]["motherboards"])} if args.motherboards else {})}))


if __name__ == "__main__":
    main()
