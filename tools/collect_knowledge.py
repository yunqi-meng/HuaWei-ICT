# -*- coding: utf-8 -*-
"""采集官方支持文章并写入知识库（自动采集，标注未人工复核）。

用法：
    python tools/collect_knowledge.py                # 只抓取并生成 artifacts/collected_knowledge.json
    python tools/collect_knowledge.py --publish      # 写入数据库并重建向量索引

来源：tools/knowledge_sources.json（由微软中文支持搜索页收集）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
OUTPUT = ROOT / "artifacts" / "collected_knowledge.json"
SOURCES = ROOT / "tools" / "knowledge_sources.json"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZhixiuKnowledgeCollector/1.0"
SKIP = re.compile(
    r"(/accessories/|/hardware-warranty|/product-safety|"
    r"/battery/(caring|maximize|testing|how-to-check)|"
    r"/download-drivers|/windows/$|/surface/$|/pc/$)"
)
KEEP = re.compile(
    r"(fix|troubleshoot|not-working|won-?t|repair|slow|performance|"
    r"install|update|error|problem|connect|sound|audio|display|screen|"
    r"camera|network|wifi|bluetooth|mouse|keyboard|touchpad|storage|"
    r"battery|printer|crash|restore|recover|reset|flicker|no-|missing|"
    r"restart|startup|sign-in|password|usb)",
    re.I,
)
CATEGORY_RULES = (
    ("network", ("wifi", "wi-fi", "network", "internet", "vpn", "网络", "联网", "连接")),
    ("audio", ("sound", "audio", "speaker", "microphone", "声音", "音频", "麦克风", "扬声器")),
    ("display", ("display", "screen", "monitor", "project", "显示", "屏幕", "投影", "分辨率")),
    ("performance", ("slow", "performance", "storage", "battery", "startup", "性能", "慢", "存储", "电池", "启动")),
    ("app", ("app", "install", "update", "printer", "mouse", "keyboard", "bluetooth", "camera", "应用", "安装", "更新", "蓝牙", "鼠标", "键盘", "摄像头", "打印机")),
)


def classify(title: str, url: str) -> str:
    text = f"{title} {url}".lower()
    for category, keywords in CATEGORY_RULES:
        if any(k in text for k in keywords):
            return category
    return "app"


def clean_text(node) -> str:
    for tag in node.select("script, style, nav, header, footer, aside, form, noscript, svg"):
        tag.decompose()
    lines = []
    for line in node.get_text("\n", strip=True).splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if len(line) < 8:
            continue
        if lines and line == lines[-1]:
            continue
        lines.append(line)
    return "\n".join(lines)


def fetch(url: str, client: httpx.Client) -> tuple[str, str, str] | None:
    for attempt in range(2):
        try:
            response = client.get(url)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "lxml")
            h1 = soup.find("h1")
            title = h1.get_text(" ", strip=True) if h1 else ""
            if not title and soup.title:
                title = re.split(r"\s*\|", soup.title.get_text(strip=True))[0]
            main = soup.find("main") or soup.find("article") or soup.body
            if not main or not title:
                return None
            content = clean_text(main)
            if len(content) < 300:
                return None
            return title[:200], content[:12000], str(response.url)
        except Exception:  # noqa: BLE001
            if attempt == 0:
                time.sleep(1.5)
    return None


def build_chunks(content: str, max_len: int = 800) -> list[str]:
    chunks, current = [], ""
    for paragraph in content.split("\n"):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if len(paragraph) > max_len:
            for i in range(0, len(paragraph), max_len):
                piece = paragraph[i:i + max_len]
                if current:
                    chunks.append(current)
                    current = ""
                chunks.append(piece)
            continue
        if len(current) + len(paragraph) + 1 > max_len:
            chunks.append(current)
            current = paragraph
        else:
            current = f"{current}\n{paragraph}".strip()
    if current:
        chunks.append(current)
    return [c for c in chunks if len(c) >= 40]


def collect(limit: int) -> list[dict]:
    urls = json.loads(SOURCES.read_text(encoding="utf-8"))
    if isinstance(urls, str):
        urls = [urls]
    candidates = [u for u in dict.fromkeys(urls) if KEEP.search(u) and not SKIP.search(u)]
    entries: list[dict] = []
    seen_titles: set[str] = set()
    with httpx.Client(headers={"User-Agent": UA}, follow_redirects=True, timeout=40) as client:
        for index, url in enumerate(candidates[:limit], 1):
            time.sleep(0.4)
            result = fetch(url, client)
            if not result:
                print(f"[{index}/{len(candidates)}] SKIP {url}")
                continue
            title, content, final_url = result
            if title in seen_titles:
                print(f"[{index}/{len(candidates)}] DUP  {title}")
                continue
            seen_titles.add(title)
            entries.append({
                "title": title,
                "category": classify(title, url),
                "content": content,
                "source_url": url,
                "final_url": final_url,
                "os_family": "windows",
                "collected_at": datetime.now(timezone.utc).isoformat(),
                "source": "Microsoft Support（中文）",
            })
            print(f"[{index}/{len(candidates)}] OK   {title} ({len(content)} chars)")
    return entries


def publish(entries: list[dict]) -> int:
    import os
    os.chdir(API_DIR)  # DATABASE_URL 是相对路径，切到 apps/api 后与运行时一致
    sys.path.insert(0, str(API_DIR))
    from app.db import q_one, tx
    from app.modules.knowledge.retrieval import build_index

    inserted = 0
    version_ids = []
    now = datetime.now(timezone.utc).isoformat()
    with tx() as conn:
        for entry in entries:
            if q_one("SELECT id FROM knowledge_documents WHERE source_url=?", (entry["source_url"],), conn):
                continue
            doc_id = "kd_" + uuid.uuid4().hex[:20]
            ver_id = "kv_" + uuid.uuid4().hex[:20]
            conn.execute(
                "INSERT INTO knowledge_documents (id,title,category,source_url,reviewer,created_at) "
                "VALUES (?,?,?,?,?,?)",
                (doc_id, entry["title"], entry["category"], entry["source_url"],
                 "自动采集（未人工复核）", now))
            applicability = {
                "os_family": entry["os_family"],
                "symptom_tags": [entry["category"]],
                "risk_level": "low",
                "auto_collected": True,
                "collected_at": entry["collected_at"],
                "source_refs": [{"title": entry["title"], "url": entry["source_url"]}],
            }
            conn.execute(
                "INSERT INTO knowledge_versions (id,document_id,version_no,status,content,applicability,"
                "visibility,reviewed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (ver_id, doc_id, 1, "published", entry["content"],
                 json.dumps(applicability, ensure_ascii=False), "public", None, now))
            for seq, text in enumerate(build_chunks(entry["content"])):
                conn.execute(
                    "INSERT INTO knowledge_chunks (id,version_id,seq,text,tags,embedding,index_version) "
                    "VALUES (?,?,?,?,?,?,?)",
                    ("kc_" + uuid.uuid4().hex[:20], ver_id, seq, text,
                     json.dumps([entry["category"]], ensure_ascii=False), None, ""))
            version_ids.append(ver_id)
            inserted += 1
    print(f"published={inserted}, versions={len(version_ids)}")
    for ver_id in version_ids:
        try:
            build_index(ver_id)
        except Exception as exc:  # noqa: BLE001
            print("index failed", ver_id, type(exc).__name__)
    return inserted


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=120)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--from-file", action="store_true", help="复用已抓取的 artifacts 结果，不重新联网")
    args = parser.parse_args()
    if args.from_file and OUTPUT.exists():
        entries = json.loads(OUTPUT.read_text(encoding="utf-8"))
        print(f"loaded={len(entries)} from {OUTPUT}")
    else:
        entries = collect(args.limit)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"collected={len(entries)} -> {OUTPUT}")
    categories: dict[str, int] = {}
    for entry in entries:
        categories[entry["category"]] = categories.get(entry["category"], 0) + 1
    print("categories:", categories)
    if args.publish:
        publish(entries)


if __name__ == "__main__":
    main()