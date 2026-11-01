"""Hardware API contracts: invalid selections must not look like successful charts."""
import unittest

import helpers  # Configure an isolated test DB and disable external model calls.
from fastapi.testclient import TestClient
from app.main import app
from app.modules.hardware.data import get_all_chips


class HardwareHTTPTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        chips = get_all_chips()
        self.cpus = [chip["id"] for chip in chips if chip["type"] == "cpu"]
        self.gpus = [chip["id"] for chip in chips if chip["type"] == "gpu"]

    def test_missing_chip_returns_404(self):
        response = self.client.get("/api/v1/hardware/chips/not-a-chip")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "NOT_FOUND")

    def test_compare_rejects_missing_and_mixed_types(self):
        response = self.client.post("/api/v1/hardware/compare", json=[self.cpus[0], "missing"])
        self.assertEqual(response.status_code, 404)
        response = self.client.post("/api/v1/hardware/compare", json=[self.cpus[0], self.gpus[0]])
        self.assertEqual(response.status_code, 400)

    def test_compare_requires_two_distinct_chips(self):
        for ids in [[], [self.cpus[0]], [self.cpus[0], self.cpus[0]]]:
            with self.subTest(ids=ids):
                self.assertEqual(self.client.post("/api/v1/hardware/compare", json=ids).status_code, 400)

    def test_compare_enforces_limit(self):
        self.assertEqual(self.client.post("/api/v1/hardware/compare", json=self.cpus[:7]).status_code, 400)

    def test_compare_preserves_selection_order_and_deduplicates(self):
        ids = self.cpus[1::-1]
        response = self.client.post("/api/v1/hardware/compare", json=ids + ids)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([chip["id"] for chip in response.json()["items"]], ids)

    def test_rankings_use_valid_metrics_for_each_chip_type(self):
        for kind, metric in [("cpu", "gb7_multi"), ("gpu", "gb7_opencl")]:
            with self.subTest(kind=kind):
                response = self.client.get(f"/api/v1/hardware/rankings?type={kind}&metric=invalid")
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["metric"], metric)
                scores = [chip[metric] for chip in data["items"]]
                self.assertEqual(scores, sorted(scores, reverse=True))

    def test_unknown_benchmarks_are_not_ranked_as_zero(self):
        data = self.client.get("/api/v1/hardware/rankings?type=cpu").json()
        self.assertNotIn("apple-m4", [c["id"] for c in data["items"]])
        for chip in data["items"]:
            self.assertTrue(chip["benchmark_source"]["url"].startswith("https://browser.geekbench.com/"))
            self.assertGreater(chip[data["metric"]], 0)

    def test_mobile_unknowns_and_power_limits_are_explicit(self):
        items = {c["id"]: c for c in get_all_chips()}
        self.assertIsNone(items["apple-m4"]["tdp"])
        self.assertIsNone(items["apple-m4"]["boost_clock"])
        self.assertEqual(items["snapdragon-7-gen3"]["year"], 2023)
        self.assertEqual(items["snapdragon-7-gen3"]["boost_clock"], 2.63)
        self.assertEqual(items["intel-i5-13400f"]["max_power"], 148)
        for chip in items.values():
            self.assertFalse(chip["efficiency_points"])
            self.assertNotIn("cb_r23_multi", chip)

    def test_invalid_chip_types_return_validation_errors(self):
        for endpoint in ["chips", "rankings"]:
            self.assertEqual(self.client.get(f"/api/v1/hardware/{endpoint}?type=other").status_code, 422)
