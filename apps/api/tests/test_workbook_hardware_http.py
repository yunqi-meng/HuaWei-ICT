"""Workbook catalogs: unknown values, preview status, filters and comparisons."""
import unittest

import helpers
from fastapi.testclient import TestClient
from app.main import app
from app.modules.hardware.motherboards import catalog


class WorkbookHardwareHTTPTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.boards = catalog()["motherboards"]

    def test_motherboard_overview_matches_source_records(self):
        data = self.client.get("/api/v1/hardware/motherboards/overview").json()
        self.assertEqual(data["total"], 299)
        self.assertEqual(data["chipset_count"], 54)
        self.assertEqual(data["with_images"], 231)
        self.assertEqual(data["preview_count"], 5)

    def test_chipset_preview_is_explicit_and_opt_in(self):
        base = self.client.get("/api/v1/hardware/chipsets").json()
        full = self.client.get("/api/v1/hardware/chipsets?include_preview=true").json()
        self.assertEqual(base["total"], 49)
        self.assertEqual(full["total"], 54)
        self.assertTrue(all(not c["is_preview"] for c in base["items"]))
        self.assertTrue(next(c for c in full["items"] if c["name"] == "Z990")["is_preview"])

    def test_motherboard_filters_and_pagination_preserve_rows(self):
        data = self.client.get("/api/v1/hardware/motherboards?chipset=Z890&memory=DDR5&has_specs=true").json()
        self.assertGreater(data["total"], 0)
        self.assertTrue(all(b["chipset"] == "Z890" and "DDR5" in b["memory_types"] and b["has_specs"] for b in data["items"]))
        first = self.client.get("/api/v1/hardware/motherboards?limit=2").json()
        second = self.client.get("/api/v1/hardware/motherboards?limit=2&offset=2").json()
        self.assertEqual(first["total"], second["total"])
        self.assertFalse({b["id"] for b in first["items"]} & {b["id"] for b in second["items"]})

    def test_partial_spec_records_are_not_filled_from_chipset(self):
        data = self.client.get("/api/v1/hardware/motherboards?has_specs=false&limit=100").json()
        self.assertGreater(data["total"], 0)
        board = data["items"][0]
        self.assertIsNone(board["vrm"])
        self.assertIsNone(board["reference_price_cny"])
        detail = self.client.get(f"/api/v1/hardware/motherboards/{board['id']}").json()
        self.assertEqual(detail["chipset_detail"]["id"], board["chipset_id"])
        self.assertIsNone(detail["memory"])

    def test_motherboard_compare_validates_and_preserves_order(self):
        ids = [b["id"] for b in self.boards[:2]][::-1]
        path = "/api/v1/hardware/motherboards/compare"
        data = self.client.post(path, json=ids + ids).json()
        self.assertEqual([b["id"] for b in data["items"]], ids)
        for selection, status in (([], 400), ([ids[0], ids[0]], 400), (ids + ["missing"], 404),
                                  ([b["id"] for b in self.boards[:5]], 400)):
            with self.subTest(selection=selection):
                self.assertEqual(self.client.post(path, json=selection).status_code, status)
        self.assertEqual(self.client.get("/api/v1/hardware/motherboards/missing").status_code, 404)

    def test_full_cpu_catalog_includes_unranked_models(self):
        overview = self.client.get("/api/v1/ladder/overview").json()
        self.assertEqual(overview["cpu_count"], 1007)
        self.assertEqual(overview["cpu_ranked"], 242)
        cpu = self.client.get("/api/v1/ladder/cpus?q=A4-3300").json()["items"][0]
        self.assertIsNone(cpu["cpuz_single"])
        self.assertFalse(cpu["has_benchmark"])
        ranked = self.client.get("/api/v1/ladder/cpus?ranked_only=true&limit=500").json()
        self.assertEqual(ranked["total"], 242)
        self.assertNotIn(cpu["id"], [c["id"] for c in ranked["items"]])

    def test_gpu_missing_score_and_bandwidth_units_are_preserved(self):
        data = self.client.get("/api/v1/ladder/gpus?q=EGA Wonder").json()["items"][0]
        self.assertIsNone(data["tdmark_ts"])
        self.assertEqual(data["theory_score"], 1.2)
        self.assertFalse(data["ts_estimated"])
        rtx = self.client.get("/api/v1/ladder/gpus?q=RTX 5090").json()["items"]
        gpu = next(g for g in rtx if g["name"] == "RTX 5090")
        self.assertEqual(gpu["memory_bandwidth_gbs"], 1792)
        self.assertEqual(gpu["memory_speed_gbps"], 28)
        self.assertNotIn("bus_width", gpu)
        ranked = self.client.get("/api/v1/ladder/rankings?type=gpu&limit=500").json()["items"]
        self.assertTrue(all(g["tdmark_ts"] is not None and g["has_benchmark"] for g in ranked))
        self.assertEqual(len(ranked), 197)

    def test_invalid_filters_do_not_silently_succeed(self):
        for query in ("vendor=other", "memory=DDR9", "offset=-1", "limit=10000"):
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f"/api/v1/hardware/motherboards?{query}").status_code, 422)
