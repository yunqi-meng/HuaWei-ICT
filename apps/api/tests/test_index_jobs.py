"""向量索引任务失败、恢复与明确关闭的持久化回归；只使用隔离测试库。"""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import helpers  # noqa: F401 初始化隔离测试库
from app.db import q_all, q_one, run
from app.security import new_id, utcnow
from app.worker import process_one


class IndexJobTests(unittest.TestCase):
    def setUp(self):
        self.version = q_one("SELECT id FROM knowledge_versions WHERE status='published' LIMIT 1")["id"]
        self.original = q_all("SELECT id,embedding,index_version FROM knowledge_chunks WHERE version_id=?", (self.version,))
        self.job_id = new_id("job")
        self.payload = json.dumps({"version_id": self.version})
        run("INSERT INTO outbox(id,kind,payload,available_at,created_at) VALUES (?,?,?,?,?)",
            (self.job_id, "index_knowledge", self.payload, utcnow().isoformat(), "0001-01-01T00:00:00+00:00"))

    def tearDown(self):
        run("DELETE FROM outbox WHERE id=?", (self.job_id,))
        for row in self.original:
            run("UPDATE knowledge_chunks SET embedding=?,index_version=? WHERE id=?",
                (row["embedding"], row["index_version"], row["id"]))
        # PostgreSQL 的旁路向量表也恢复，避免测试之间污染检索结果。
        from app.config import get_settings
        if (get_settings().database_url.startswith("postgres")
                and q_one("SELECT to_regclass('knowledge_vectors') AS name")["name"]):
            # 测试写入的向量由当前版本原始 JSON 向量决定是否需要移除。
            for row in self.original:
                run("DELETE FROM knowledge_vectors WHERE chunk_id=?", (row["id"],))
                if row["embedding"]:
                    vector = json.loads(row["embedding"])
                    run("INSERT INTO knowledge_vectors VALUES (?,?,?::vector)",
                        (row["id"], vector["model"], json.dumps(vector["values"])))

    def job(self):
        return q_one("SELECT * FROM outbox WHERE id=?", (self.job_id,))

    def test_failure_preserves_payload_and_recovers_on_retry(self):
        client = SimpleNamespace(embedding_enabled=True, embed=lambda _: None)
        with patch("app.modules.knowledge.retrieval.get_llm", return_value=client):
            self.assertTrue(process_one())
        row = self.job()
        self.assertEqual((row["status"], row["attempts"]), ("pending", 1))
        self.assertEqual(row["payload"], self.payload)
        self.assertTrue(row["last_error"])
        self.assertGreater(row["available_at"], utcnow().isoformat())
        run("UPDATE outbox SET available_at=? WHERE id=?", (utcnow().isoformat(), self.job_id))
        client.embed = lambda texts: [[0.5, 1.0] for _ in texts]
        with patch("app.modules.knowledge.retrieval.get_llm", return_value=client):
            self.assertTrue(process_one())
        self.assertEqual((self.job()["status"], self.job()["attempts"]), ("done", 2))
        self.assertEqual(self.job()["payload"], "{}")
        self.assertEqual(self.job()["last_error"], "")
        rows = q_all("SELECT embedding FROM knowledge_chunks WHERE version_id=?", (self.version,))
        self.assertTrue(rows)
        self.assertTrue(all(json.loads(r["embedding"])["values"] == [0.5, 1.0] for r in rows))

    def test_repeated_service_failure_stops_with_recoverable_failed_job(self):
        client = SimpleNamespace(embedding_enabled=True, embed=lambda _: None)
        with patch("app.modules.knowledge.retrieval.get_llm", return_value=client):
            for _ in range(5):
                run("UPDATE outbox SET available_at=? WHERE id=?", (utcnow().isoformat(), self.job_id))
                self.assertTrue(process_one())
        self.assertEqual((self.job()["status"], self.job()["attempts"]), ("failed", 5))
        self.assertEqual(self.job()["payload"], self.payload)

    def test_explicit_bm25_mode_does_not_call_embedding_service(self):
        from unittest.mock import Mock
        client = SimpleNamespace(embedding_enabled=False, embed=Mock(side_effect=AssertionError("must not call")))
        with patch("app.modules.knowledge.retrieval.get_llm", return_value=client):
            self.assertTrue(process_one())
        client.embed.assert_not_called()
        self.assertEqual(self.job()["status"], "done")

    def test_malformed_embedding_response_remains_retryable(self):
        client = SimpleNamespace(embedding_enabled=True, embed=lambda texts: [[float("nan")] for _ in texts])
        with patch("app.modules.knowledge.retrieval.get_llm", return_value=client):
            self.assertTrue(process_one())
        self.assertEqual(self.job()["status"], "pending")
        self.assertEqual(self.job()["payload"], self.payload)
