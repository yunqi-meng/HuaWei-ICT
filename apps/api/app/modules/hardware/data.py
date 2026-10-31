"""硬件性能数据库 — 芯片跑分与能效数据（公开基准测试近似值）"""

# CPU 数据: Geekbench 6 / Cinebench R23 近似公开成绩
CPUS = [
    {"id": "apple-m4", "name": "Apple M4", "brand": "Apple", "type": "cpu", "arch": "ARM", "process": "3nm", "year": 2024, "tier": "flagship",
     "cores": "4P+6E", "threads": 10, "base_clock": 4.4, "boost_clock": 4.4, "tdp": 22,
     "gb6_single": 3800, "gb6_multi": 15200, "cb_r23_single": 2150, "cb_r23_multi": 14500,
     "efficiency_points": [{"power": 5, "score": 2800}, {"power": 10, "score": 3400}, {"power": 15, "score": 3650}, {"power": 22, "score": 3800}],
     "memory": "LPDDR5X-7500", "gpu_score": 28500},
    {"id": "apple-m3", "name": "Apple M3", "brand": "Apple", "type": "cpu", "arch": "ARM", "process": "3nm", "year": 2023, "tier": "flagship",
     "cores": "4P+4E", "threads": 8, "base_clock": 4.0, "boost_clock": 4.0, "tdp": 20,
     "gb6_single": 3100, "gb6_multi": 11800, "cb_r23_single": 1900, "cb_r23_multi": 11000,
     "efficiency_points": [{"power": 5, "score": 2300}, {"power": 10, "score": 2850}, {"power": 15, "score": 3000}, {"power": 20, "score": 3100}],
     "memory": "LPDDR5-6400", "gpu_score": 22000},
    {"id": "snapdragon-8-elite", "name": "Snapdragon 8 Elite", "brand": "Qualcomm", "type": "cpu", "arch": "ARM", "process": "3nm", "year": 2024, "tier": "flagship",
     "cores": "2P+6E", "threads": 8, "base_clock": 4.3, "boost_clock": 4.3, "tdp": 12,
     "gb6_single": 3200, "gb6_multi": 10000, "cb_r23_single": 2050, "cb_r23_multi": 9800,
     "efficiency_points": [{"power": 3, "score": 2100}, {"power": 6, "score": 2800}, {"power": 9, "score": 3100}, {"power": 12, "score": 3200}],
     "memory": "LPDDR5X-8533", "gpu_score": 26000},
    {"id": "dimensity-9400", "name": "Dimensity 9400", "brand": "MediaTek", "type": "cpu", "arch": "ARM", "process": "3nm", "year": 2024, "tier": "flagship",
     "cores": "1P+3E+4E", "threads": 8, "base_clock": 3.6, "boost_clock": 3.6, "tdp": 11,
     "gb6_single": 2950, "gb6_multi": 9200, "cb_r23_single": 1950, "cb_r23_multi": 9000,
     "efficiency_points": [{"power": 3, "score": 1900}, {"power": 6, "score": 2600}, {"power": 9, "score": 2850}, {"power": 11, "score": 2950}],
     "memory": "LPDDR5X-9600", "gpu_score": 24500},
    {"id": "intel-u9-285k", "name": "Intel Core Ultra 9 285K", "brand": "Intel", "type": "cpu", "arch": "x86", "process": "TSMC N3B", "year": 2024, "tier": "flagship",
     "cores": "8P+16E", "threads": 24, "base_clock": 3.7, "boost_clock": 5.7, "tdp": 125,
     "gb6_single": 3350, "gb6_multi": 26500, "cb_r23_single": 2300, "cb_r23_multi": 40500,
     "efficiency_points": [{"power": 30, "score": 1800}, {"power": 65, "score": 2600}, {"power": 95, "score": 3100}, {"power": 125, "score": 3350}, {"power": 250, "score": 3400}],
     "memory": "DDR5-6400", "gpu_score": 12000},
    {"id": "intel-u7-265k", "name": "Intel Core Ultra 7 265K", "brand": "Intel", "type": "cpu", "arch": "x86", "process": "TSMC N3B", "year": 2024, "tier": "high-end",
     "cores": "8P+12E", "threads": 20, "base_clock": 3.9, "boost_clock": 5.5, "tdp": 125,
     "gb6_single": 3150, "gb6_multi": 22000, "cb_r23_single": 2150, "cb_r23_multi": 33500,
     "efficiency_points": [{"power": 30, "score": 1650}, {"power": 65, "score": 2400}, {"power": 95, "score": 2900}, {"power": 125, "score": 3150}],
     "memory": "DDR5-6400", "gpu_score": 11500},
    {"id": "intel-i7-14700k", "name": "Intel Core i7-14700K", "brand": "Intel", "type": "cpu", "arch": "x86", "process": "Intel 7", "year": 2023, "tier": "high-end",
     "cores": "8P+12E", "threads": 28, "base_clock": 3.4, "boost_clock": 5.6, "tdp": 125,
     "gb6_single": 2950, "gb6_multi": 21000, "cb_r23_single": 2100, "cb_r23_multi": 32000,
     "efficiency_points": [{"power": 40, "score": 1500}, {"power": 80, "score": 2200}, {"power": 125, "score": 2800}, {"power": 190, "score": 2950}],
     "memory": "DDR5-5600", "gpu_score": 11000},
    {"id": "ryzen-9-9950x", "name": "AMD Ryzen 9 9950X", "brand": "AMD", "type": "cpu", "arch": "x86", "process": "TSMC N4", "year": 2024, "tier": "flagship",
     "cores": "16P", "threads": 32, "base_clock": 4.3, "boost_clock": 5.7, "tdp": 170,
     "gb6_single": 3300, "gb6_multi": 28000, "cb_r23_single": 2250, "cb_r23_multi": 42500,
     "efficiency_points": [{"power": 45, "score": 1800}, {"power": 90, "score": 2700}, {"power": 140, "score": 3150}, {"power": 170, "score": 3300}],
     "memory": "DDR5-5600", "gpu_score": 12500},
    {"id": "ryzen-7-9700x", "name": "AMD Ryzen 7 9700X", "brand": "AMD", "type": "cpu", "arch": "x86", "process": "TSMC N4", "year": 2024, "tier": "high-end",
     "cores": "8P", "threads": 16, "base_clock": 3.8, "boost_clock": 5.5, "tdp": 65,
     "gb6_single": 3150, "gb6_multi": 17500, "cb_r23_single": 2150, "cb_r23_multi": 24000,
     "efficiency_points": [{"power": 25, "score": 1700}, {"power": 45, "score": 2500}, {"power": 65, "score": 2950}, {"power": 88, "score": 3150}],
     "memory": "DDR5-5600", "gpu_score": 11000},
    {"id": "ryzen-5-7600x", "name": "AMD Ryzen 5 7600X", "brand": "AMD", "type": "cpu", "arch": "x86", "process": "TSMC N5", "year": 2022, "tier": "mid-range",
     "cores": "6P", "threads": 12, "base_clock": 4.7, "boost_clock": 5.3, "tdp": 105,
     "gb6_single": 2800, "gb6_multi": 13500, "cb_r23_single": 1950, "cb_r23_multi": 17500,
     "efficiency_points": [{"power": 30, "score": 1500}, {"power": 55, "score": 2100}, {"power": 80, "score": 2600}, {"power": 105, "score": 2800}],
     "memory": "DDR5-5200", "gpu_score": 10500},
    {"id": "intel-i5-13400f", "name": "Intel Core i5-13400F", "brand": "Intel", "type": "cpu", "arch": "x86", "process": "Intel 7", "year": 2023, "tier": "mid-range",
     "cores": "6P+4E", "threads": 16, "base_clock": 2.5, "boost_clock": 4.6, "tdp": 65,
     "gb6_single": 2450, "gb6_multi": 13800, "cb_r23_single": 1750, "cb_r23_multi": 17200,
     "efficiency_points": [{"power": 25, "score": 1300}, {"power": 45, "score": 1850}, {"power": 65, "score": 2300}, {"power": 82, "score": 2450}],
     "memory": "DDR4-3200", "gpu_score": 10000},
    {"id": "snapdragon-7-gen3", "name": "Snapdragon 7 Gen 3", "brand": "Qualcomm", "type": "cpu", "arch": "ARM", "process": "4nm", "year": 2024, "tier": "mid-range",
     "cores": "1P+3E+4E", "threads": 8, "base_clock": 2.6, "boost_clock": 2.6, "tdp": 8,
     "gb6_single": 1900, "gb6_multi": 5800, "cb_r23_single": 1250, "cb_r23_multi": 5500,
     "efficiency_points": [{"power": 2, "score": 1400}, {"power": 4, "score": 1750}, {"power": 6, "score": 1850}, {"power": 8, "score": 1900}],
     "memory": "LPDDR5-6400", "gpu_score": 12000},
    {"id": "ryzen-5-5600g", "name": "AMD Ryzen 5 5600G", "brand": "AMD", "type": "cpu", "arch": "x86", "process": "TSMC N7", "year": 2021, "tier": "budget",
     "cores": "6P", "threads": 12, "base_clock": 3.9, "boost_clock": 4.4, "tdp": 65,
     "gb6_single": 1950, "gb6_multi": 9500, "cb_r23_single": 1450, "cb_r23_multi": 11500,
     "efficiency_points": [{"power": 25, "score": 1100}, {"power": 40, "score": 1500}, {"power": 55, "score": 1800}, {"power": 65, "score": 1950}],
     "memory": "DDR4-3200", "gpu_score": 8500},
    {"id": "intel-i3-12100f", "name": "Intel Core i3-12100F", "brand": "Intel", "type": "cpu", "arch": "x86", "process": "Intel 7", "year": 2022, "tier": "budget",
     "cores": "4P", "threads": 8, "base_clock": 3.3, "boost_clock": 4.3, "tdp": 58,
     "gb6_single": 2200, "gb6_multi": 7800, "cb_r23_single": 1650, "cb_r23_multi": 8200,
     "efficiency_points": [{"power": 20, "score": 1100}, {"power": 35, "score": 1600}, {"power": 50, "score": 2050}, {"power": 58, "score": 2200}],
     "memory": "DDR4-3200", "gpu_score": 9500},
]

# GPU 数据: 3DMark Steel Nomad / Time Spy 近似公开成绩
GPUS = [
    {"id": "rtx-5090", "name": "NVIDIA GeForce RTX 5090", "brand": "NVIDIA", "type": "gpu", "arch": "Blackwell", "process": "TSMC N4P", "year": 2025, "tier": "flagship",
     "vram": 32, "vram_type": "GDDR7", "tdp": 575,
     "ts_score": 34500, "sn_score": 12500, "sn_dx12": 11200,
     "efficiency_points": [{"power": 150, "score": 8500}, {"power": 300, "score": 14500}, {"power": 450, "score": 17500}, {"power": 575, "score": 18500}],
     "bus_width": 512},
    {"id": "rtx-4090", "name": "NVIDIA GeForce RTX 4090", "brand": "NVIDIA", "type": "gpu", "arch": "Ada Lovelace", "process": "TSMC N4", "year": 2022, "tier": "flagship",
     "vram": 24, "vram_type": "GDDR6X", "tdp": 450,
     "ts_score": 28500, "sn_score": 9800, "sn_dx12": 8800,
     "efficiency_points": [{"power": 120, "score": 7000}, {"power": 250, "score": 11500}, {"power": 350, "score": 13800}, {"power": 450, "score": 14800}],
     "bus_width": 384},
    {"id": "rtx-4080-super", "name": "NVIDIA GeForce RTX 4080 Super", "brand": "NVIDIA", "type": "gpu", "arch": "Ada Lovelace", "process": "TSMC N4", "year": 2024, "tier": "flagship",
     "vram": 16, "vram_type": "GDDR6X", "tdp": 320,
     "ts_score": 23500, "sn_score": 8200, "sn_dx12": 7400,
     "efficiency_points": [{"power": 100, "score": 5800}, {"power": 200, "score": 9500}, {"power": 280, "score": 11200}, {"power": 320, "score": 11800}],
     "bus_width": 256},
    {"id": "rtx-4070-super", "name": "NVIDIA GeForce RTX 4070 Super", "brand": "NVIDIA", "type": "gpu", "arch": "Ada Lovelace", "process": "TSMC N4", "year": 2024, "tier": "high-end",
     "vram": 12, "vram_type": "GDDR6X", "tdp": 220,
     "ts_score": 19200, "sn_score": 6500, "sn_dx12": 5800,
     "efficiency_points": [{"power": 80, "score": 4500}, {"power": 150, "score": 7200}, {"power": 200, "score": 8200}, {"power": 220, "score": 8500}],
     "bus_width": 192},
    {"id": "rtx-4060", "name": "NVIDIA GeForce RTX 4060", "brand": "NVIDIA", "type": "gpu", "arch": "Ada Lovelace", "process": "TSMC N4", "year": 2023, "tier": "mid-range",
     "vram": 8, "vram_type": "GDDR6", "tdp": 115,
     "ts_score": 12500, "sn_score": 4200, "sn_dx12": 3800,
     "efficiency_points": [{"power": 40, "score": 2800}, {"power": 70, "score": 3800}, {"power": 95, "score": 4200}, {"power": 115, "score": 4400}],
     "bus_width": 128},
    {"id": "rx-7900-xtx", "name": "AMD Radeon RX 7900 XTX", "brand": "AMD", "type": "gpu", "arch": "RDNA 3", "process": "TSMC N5", "year": 2022, "tier": "flagship",
     "vram": 24, "vram_type": "GDDR6", "tdp": 355,
     "ts_score": 24500, "sn_score": 8500, "sn_dx12": 7800,
     "efficiency_points": [{"power": 100, "score": 5500}, {"power": 200, "score": 9800}, {"power": 300, "score": 12200}, {"power": 355, "score": 12800}],
     "bus_width": 384},
    {"id": "rx-7800-xt", "name": "AMD Radeon RX 7800 XT", "brand": "AMD", "type": "gpu", "arch": "RDNA 3", "process": "TSMC N5", "year": 2023, "tier": "high-end",
     "vram": 16, "vram_type": "GDDR6", "tdp": 263,
     "ts_score": 17800, "sn_score": 5800, "sn_dx12": 5200,
     "efficiency_points": [{"power": 80, "score": 4000}, {"power": 150, "score": 6800}, {"power": 220, "score": 8200}, {"power": 263, "score": 8600}],
     "bus_width": 256},
    {"id": "rx-7600", "name": "AMD Radeon RX 7600", "brand": "AMD", "type": "gpu", "arch": "RDNA 3", "process": "TSMC N6", "year": 2023, "tier": "mid-range",
     "vram": 8, "vram_type": "GDDR6", "tdp": 165,
     "ts_score": 11200, "sn_score": 3600, "sn_dx12": 3200,
     "efficiency_points": [{"power": 50, "score": 2200}, {"power": 90, "score": 3200}, {"power": 130, "score": 3600}, {"power": 165, "score": 3800}],
     "bus_width": 128},
    {"id": "arc-a770", "name": "Intel Arc A770", "brand": "Intel", "type": "gpu", "arch": "Alchemist", "process": "TSMC N6", "year": 2022, "tier": "mid-range",
     "vram": 16, "vram_type": "GDDR6", "tdp": 225,
     "ts_score": 13800, "sn_score": 4200, "sn_dx12": 3900,
     "efficiency_points": [{"power": 70, "score": 2800}, {"power": 130, "score": 4200}, {"power": 190, "score": 5200}, {"power": 225, "score": 5500}],
     "bus_width": 256},
    {"id": "gtx-1660-super", "name": "NVIDIA GeForce GTX 1660 Super", "brand": "NVIDIA", "type": "gpu", "arch": "Turing", "process": "TSMC N12", "year": 2019, "tier": "budget",
     "vram": 6, "vram_type": "GDDR6", "tdp": 125,
     "ts_score": 6200, "sn_score": 1800, "sn_dx12": 1650,
     "efficiency_points": [{"power": 40, "score": 1100}, {"power": 70, "score": 1550}, {"power": 100, "score": 1750}, {"power": 125, "score": 1850}],
     "bus_width": 192},
]


def get_all_chips():
    return CPUS + GPUS


def get_chip(chip_id: str):
    for c in get_all_chips():
        if c["id"] == chip_id:
            return c
    return None


def get_rankings(chip_type: str = "cpu", metric: str = "gb6_multi"):
    items = [c for c in get_all_chips() if c.get("type") == chip_type]
    items.sort(key=lambda x: x.get(metric, 0), reverse=True)
    return [{"rank": i + 1, **c} for i, c in enumerate(items)]


def compare_chips(chip_ids: list[str]):
    result = []
    for cid in chip_ids:
        chip = get_chip(cid)
        if chip:
            result.append(chip)
    return result
