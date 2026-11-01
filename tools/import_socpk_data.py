"""Import a version-consistent public SOCPK snapshot. Requires Python and Node.

No admin endpoints, login credentials, signed tokens, images, or site code are published.
Run: python tools/import_socpk_data.py [--cache-dir artifacts/socpk] [--refresh]
Review the resulting data diff before publishing a refreshed snapshot.
"""
import argparse
import base64
import hashlib
import json
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://www.socpk.com"
SLUGS = ("mobile-soc-spec26", "mobile-soc-efficiency-gb7", "mobile-soc-efficiency-snl", "laptop-gpu-efficiency",
         "geekbench-6", "geekbench-5", "gfxbench-5", "3dmark-wle", "chip-overall", "chip-cpu", "chip-gpu", "chip-cpu-efficiency")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "artifacts/socpk")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    cache = args.cache_dir.resolve()
    cache.mkdir(parents=True, exist_ok=True)

    def fetch(path, name):
        target = cache / name
        if args.refresh or not target.exists():
            with urlopen(Request(ORIGIN + path, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as response:
                target.write_bytes(response.read())
        return target.read_bytes()

    html = fetch("/", "index.html").decode()
    script = re.search(r'src="(/assets/index-[^"/]+\.js)"', html)
    if not script:
        raise ValueError("SOCPK entry script changed; inspect before refreshing")
    js = fetch(script[1], "site.js").decode()
    codec = re.search(r'data:application/wasm;base64,([A-Za-z0-9+/=]+)', js)
    if not codec:
        raise ValueError("Public chart codec changed")
    metadata, payloads = {}, []
    for slug in SLUGS:
        meta = json.loads(fetch(f"/api/pages/{slug}", slug + ".json"))
        data = json.loads(fetch(f"/api/pages/{slug}/data", slug + "-data.json"))
        if meta.get("dataVersion") != data.get("dataVersion"):
            raise ValueError(f"{slug}: version mismatch; refresh both responses")
        if {s["id"] for s in meta["series"]} != {s["id"] for s in data["series"]}:
            raise ValueError(f"{slug}: series mismatch")
        metadata[slug] = meta
        payloads.append({"slug": slug, "series": data["series"]})
    with tempfile.TemporaryDirectory(prefix="zhixiu-socpk-") as temp:
        folder = Path(temp)
        (folder / "codec.wasm").write_bytes(base64.b64decode(codec[1], validate=True))
        (folder / "input.json").write_text(json.dumps(payloads), encoding="utf-8")
        subprocess.run(["node", str(ROOT / "tools/socpk_decode.cjs"), str(folder / "codec.wasm"), str(folder / "input.json"), str(folder / "output.json")], check=True, timeout=30)
        decoded = json.loads((folder / "output.json").read_text(encoding="utf-8"))
    snapshot = {"schema_version": 1, "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "publisher": "SOCPK / 极客湾", "origin": ORIGIN, "pages": []}
    # Codec reconstruction carries tiny floating-point errors. Retain four decimals,
    # snapping only values already within 0.0001 of an integer. No points are invented.
    def rounded(value):
        return int(round(value)) if abs(value - round(value)) < 0.0001 else round(value, 4)
    for page in decoded:
        slug = page["slug"]
        meta = metadata[slug]
        by_id = {s["id"]: s for s in meta["series"]}
        rows = []
        for row in page["series"]:
            info = by_id[row["id"]]
            points = row["points"]
            if meta["type"] == "line-chart":
                if not all(len(p) == 2 and p[0] > 0 and p[1] >= 0 for p in points):
                    raise ValueError(f"{slug}/{row['id']}: invalid curve points")
                points = [[rounded(x), rounded(y)] for x, y in points]
                if not all(a[0] < b[0] for a, b in zip(points, points[1:])):
                    raise ValueError(f"{slug}/{row['id']}: non-increasing power")
            else:
                points = [rounded(v) for v in points]
            rows.append({"id": str(row["id"]), "name": info["name"], "name_en": info.get("name_en", ""),
                         "group": info.get("group", ""), "meta": info.get("meta", {}), "points": points})
        snapshot["pages"].append({"slug": slug, "type": meta["type"], "title": meta["title_zh"],
            "source_url": ORIGIN + "/chart/" + slug, "version": meta["dataVersion"],
            "payload_sha256": hashlib.sha256((cache / (slug + "-data.json")).read_bytes()).hexdigest(),
            "config": meta.get("config", {}), "series": rows})
    output = ROOT / "apps/web/src/data/socpkCatalog.json"
    temp_output = output.with_suffix(".json.tmp")
    temp_output.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temp_output.replace(output)
    print(json.dumps({"pages":len(snapshot["pages"]),"series":sum(len(p["series"]) for p in snapshot["pages"]),"bytes":output.stat().st_size},ensure_ascii=False))


if __name__ == "__main__":
    main()
