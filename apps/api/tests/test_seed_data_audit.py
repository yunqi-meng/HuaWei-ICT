"""Demo corrections must preserve history and leave reviewed material alone."""
import json
import sqlite3
import unittest

import helpers
from app.db import SCHEMA
from app.seed import _seed_flows, _seed_guides


class SeedDataAuditTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.addCleanup(self.conn.close)
        _seed_flows(self.conn)
        _seed_guides(self.conn)

    def test_repeated_seed_does_not_duplicate_versions(self):
        before = [self.conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                  for table in ("flow_versions", "knowledge_versions")]
        _seed_flows(self.conn)
        _seed_guides(self.conn)
        after = [self.conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                 for table in ("flow_versions", "knowledge_versions")]
        self.assertEqual(before, after)

    def test_old_demo_content_gets_new_version_and_keeps_history(self):
        old = self.conn.execute("SELECT * FROM flow_versions LIMIT 1").fetchone()
        graph = json.loads(old["graph"])
        graph["nodes"][graph["entry"]]["instruction"] = "旧演示内容"
        self.conn.execute("UPDATE flow_versions SET graph=? WHERE id=?", (json.dumps(graph), old["id"]))
        _seed_flows(self.conn)
        retained = self.conn.execute("SELECT * FROM flow_versions WHERE id=?", (old["id"],)).fetchone()
        self.assertEqual(retained["status"], "withdrawn")
        self.assertIn("旧演示内容", json.loads(retained["graph"])["nodes"][graph["entry"]]["instruction"])
        latest = self.conn.execute("SELECT * FROM flow_versions WHERE flow_id=? AND status='published'", (old["flow_id"],)).fetchone()
        self.assertGreater(latest["version_no"], old["version_no"])
        guide = self.conn.execute("SELECT * FROM knowledge_versions LIMIT 1").fetchone()
        self.conn.execute("UPDATE knowledge_versions SET content='旧演示指南' WHERE id=?", (guide["id"],))
        _seed_guides(self.conn)
        self.assertEqual(self.conn.execute("SELECT content FROM knowledge_versions WHERE id=?", (guide["id"],)).fetchone()[0], "旧演示指南")
        self.assertEqual(self.conn.execute("SELECT status FROM knowledge_versions WHERE id=?", (guide["id"],)).fetchone()[0], "withdrawn")

    def test_human_reviewed_material_is_never_replaced(self):
        self.conn.execute("UPDATE flow_versions SET reviewer='人工审核员', source_refs='[]'")
        self.conn.execute("UPDATE knowledge_documents SET reviewer='人工审核员'")
        self.conn.execute("UPDATE knowledge_versions SET content='人工编写并审核的指南', reviewed_at='2026-11-01T00:00:00+00:00'")
        _seed_flows(self.conn)
        _seed_guides(self.conn)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM flow_versions").fetchone()[0], 10)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM knowledge_versions").fetchone()[0], 10)
        self.assertEqual(self.conn.execute("SELECT content FROM knowledge_versions LIMIT 1").fetchone()[0], "人工编写并审核的指南")
