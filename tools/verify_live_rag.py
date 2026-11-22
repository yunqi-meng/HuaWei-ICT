"""以隔离库验证真实 RAG；必须显式 --live，会产生少量外部模型调用费用。"""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/live-rag-validation.json")
    args = parser.parse_args()
    if not args.live:
        parser.error("需显式传入 --live 才会调用外部模型")
    sys.path.insert(0, str(ROOT / "apps/api"))
    # 按项目配置定位来源库；请从项目根目录或 apps/api 运行。
    from app.config import get_settings
    settings = get_settings()
    source_url = settings.database_url
    if not source_url.startswith("sqlite:///"):
        parser.error("该本地验证工具仅支持 SQLite 来源库；PostgreSQL 请用专用验证库")
    source_path = Path(source_url.removeprefix("sqlite:///"))
    if not source_path.is_absolute():
        source_path = ROOT / "apps/api" / source_path
    if not source_path.is_file():
        parser.error("知识来源库不存在")
    report = {"scope": "minimal_live_rag_validation", "source_database_modified": False}
    with tempfile.TemporaryDirectory(prefix="zhixiu-live-rag-") as directory:
        path = Path(directory) / "validation.db"
        settings.database_url = "sqlite:///" + str(path)
        settings.auto_seed = False
        from app.db import init_db, q_one
        init_db()
        try:
            with closing(sqlite3.connect(source_path.resolve().as_uri() + "?mode=ro", uri=True)) as source:
                with closing(sqlite3.connect(path)) as target:
                    # 仅复制公共知识及分块，不复制账号、联系人、会话、工单或附件。
                    for table in ("knowledge_documents", "knowledge_versions", "knowledge_chunks"):
                        columns = [r[1] for r in source.execute("PRAGMA table_info(" + table + ")")]
                        target.executemany("INSERT INTO " + table + " (" + ",".join(columns) + ") VALUES (" +
                                           ",".join("?" for _ in columns) + ")", source.execute("SELECT * FROM " + table).fetchall())
                    target.commit()
            from app.modules.integrations.llm import get_llm
            from app.modules.diagnosis.model_flow import generate_step
            client = get_llm()
            original_rerank = client.rerank

            def observed_rerank(query, documents, top_n=5):
                order = original_rerank(query, documents, top_n)
                report["rerank_success"] = bool(isinstance(order, list) and order and
                    len(set(order)) == len(order) and all(isinstance(i, int) and 0 <= i < len(documents) for i in order))
                return order

            client.rerank = observed_rerank
            try:
                step = generate_step({"id": "", "user_id": "live-validation-only",
                    "symptom_text": "Wi-Fi 已连接但网页打不开，Windows 11", "symptom_category": "network",
                    "facts": {"os": "Windows 11"}, "tried_steps": []})
            finally:
                client.rerank = original_rerank
            report.update(validated_step=step is not None, action=step["action"] if step else None,
                          citation_count=len(step["citations"]) if step else 0,
                          retrieval_mode=(q_one("SELECT mode FROM retrieval_traces ORDER BY created_at DESC LIMIT 1") or {}).get("mode"),
                          chat_success_count=q_one("SELECT COUNT(*) AS n FROM model_runs WHERE status='success'")["n"])
        finally:
            settings.database_url = source_url
    report["passed"] = bool(report["validated_step"] and report["citation_count"] > 0 and
                            report["retrieval_mode"] == "hybrid" and report.get("rerank_success"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
