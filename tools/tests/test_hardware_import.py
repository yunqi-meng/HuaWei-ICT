"""Small workbook fixtures exercise conversion without access to private source paths."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

import openpyxl
from openpyxl.drawing.image import Image as ExcelImage
from PIL import Image

MODULE = Path(__file__).resolve().parents[1] / "excel_to_ladder.py"
spec = importlib.util.spec_from_file_location("hardware_import", MODULE)
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class HardwareImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)

    def test_numeric_missing_values_and_qualified_power(self):
        for value in (None, "—", "暂无数据", float("nan"), float("inf"), True):
            self.assertIsNone(importer.num(value))
        self.assertEqual(importer.nominal("125 (MTP 250)"), 125)
        self.assertEqual(importer.nominal("24 (8P+16E)"), 24)
        self.assertIsNone(importer.nominal("15-54"))

    def test_gpu_theory_score_never_fills_missing_timespy(self):
        path = self.folder / "gpu.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "全量参数库"
        ws.append(["header"])
        ws.append([])
        ws.append([])
        ws.append(["columns"])
        ws.append(["M4 Max", "Apple", "Desktop", "Apple", "旗舰", 185, 18500, "—", 120, 3, 2024,
                   "共享", "UMA", 546, 8.5, 1500, "无公开3DMark TS分"])
        wb.save(path)
        before = path.read_bytes()
        gpu = importer.convert_gpu(path, "2026-11-07")[0]
        self.assertIsNone(gpu["tdmark_ts"])
        self.assertEqual(gpu["theory_score"], 18500)
        self.assertEqual(gpu["memory_bandwidth_gbs"], 546)
        self.assertEqual(gpu["memory_speed_gbps"], 8.5)
        self.assertEqual(gpu["vram_text"], "共享")
        self.assertEqual(gpu["source_ref"]["row"], 5)
        self.assertEqual(path.read_bytes(), before)

    def test_cpu_unranked_models_and_raw_core_power_values_survive(self):
        path = self.folder / "cpu.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "全量参数库"
        for _ in range(4):
            ws.append(["header"])
        ws.append(["Core Example", "Desktop 桌面", "24 (8P+16E)", 24, "3.7", "5.5", "125 (MTP 250)",
                   None, None, None, None, "仅参数索引", "仅规格参数", "×5", "https://www.intel.com/", "source"])
        ref = wb.create_sheet("数据来源")
        for _ in range(4):
            ref.append(["header"])
        wb.save(path)
        cpu = importer.convert_cpu(path, "2026-11-07")[0]
        self.assertEqual(cpu["cores"], 24)
        self.assertEqual(cpu["cores_text"], "24 (8P+16E)")
        self.assertEqual(cpu["tdp"], 125)
        self.assertEqual(cpu["power_text"], "125 (MTP 250)")
        self.assertFalse(cpu["has_benchmark"])
        self.assertIsNone(cpu["cpuz_composite"])

    def test_motherboard_photo_joins_by_row_and_preview_is_not_a_product(self):
        path = self.folder / "boards.xlsx"
        photo = self.folder / "fixture.png"
        Image.new("RGB", (3, 3), "white").save(photo)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "品牌主板明细"
        ws.append(["headers"])
        ws.append(["Z890", "华硕", "Example board", "ATX", "16+1相", "DDR5", "30×24cm", "24+8pin", None, 1234, None, "fixture"])
        ws.append(["B960", "—", "—", None, None, None, None, None, None, None, None, "预告"])
        ws.add_image(ExcelImage(str(photo)), "K2")
        chipsets = wb.create_sheet("芯片组总表")
        chipsets.append(["headers"])
        chipsets.append(["Intel", "Z890", "LGA1851", "2024年10月", "旗舰", "6W", "12相以上", "DDR5", None, None, "8", None, "是/是", None])
        chipsets.append(["Intel", "B960", "LGA1954", "2026年末", "主流", None, None, "DDR5", None, None, None, None, None, "预告"])
        wb.create_sheet("说明与来源").append(["数据来源", "test source"])
        wb.save(path)
        data = importer.convert_motherboards(path, "2026-11-07", self.folder / "images")
        self.assertEqual(len(data["motherboards"]), 1)
        self.assertEqual(len(data["chipsets"]), 2)
        self.assertTrue(data["chipsets"][1]["is_preview"])
        board = data["motherboards"][0]
        self.assertEqual(board["source_ref"]["row"], 2)
        self.assertTrue(board["image"])
        self.assertEqual(len(list((self.folder / "images").glob("*.png"))), 1)
        self.assertIsNone(board["audio"])
