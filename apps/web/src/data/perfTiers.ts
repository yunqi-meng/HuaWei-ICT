/** 性能天梯图数据 — 来源: CPU Benchmark 6.092 / GPU Benchmark 9.115 */

export interface TierItem {
  name: string;
  score: number; // 归一化性能分 (以当前旗舰=1000为基准)
  brand: string;
}

export interface TierLevel {
  label: string;
  ratio: string;
  items: TierItem[];
}

// ====================== CPU 桌面端 ======================
export const CPU_DESKTOP_TIERS: TierLevel[] = [
  { label: "顶级旗舰", ratio: "400x+", items: [
    { name: "Ryzen 9 9950X", score: 1000, brand: "AMD" },
    { name: "Core Ultra 9 285K", score: 985, brand: "Intel" },
    { name: "Ryzen 9 9900X", score: 920, brand: "AMD" },
    { name: "Core i9-14900K", score: 900, brand: "Intel" },
    { name: "Core i9-13900K", score: 870, brand: "Intel" },
  ]},
  { label: "高端", ratio: "200-400x", items: [
    { name: "Core Ultra 7 265K", score: 830, brand: "Intel" },
    { name: "Ryzen 7 9700X", score: 800, brand: "AMD" },
    { name: "Core i7-14700K", score: 780, brand: "Intel" },
    { name: "Core i7-13700K", score: 750, brand: "Intel" },
    { name: "Ryzen 7 7800X3D", score: 740, brand: "AMD" },
    { name: "Core i9-12900K", score: 720, brand: "Intel" },
    { name: "Ryzen 9 7900X", score: 710, brand: "AMD" },
  ]},
  { label: "中高端", ratio: "100-200x", items: [
    { name: "Core Ultra 5 245K", score: 650, brand: "Intel" },
    { name: "Ryzen 5 9600X", score: 630, brand: "AMD" },
    { name: "Core i5-14600K", score: 610, brand: "Intel" },
    { name: "Ryzen 7 7700X", score: 600, brand: "AMD" },
    { name: "Core i5-13600K", score: 580, brand: "Intel" },
    { name: "Ryzen 5 7600X", score: 540, brand: "AMD" },
    { name: "Core i5-12600K", score: 520, brand: "Intel" },
    { name: "Core Ultra 5 225", score: 500, brand: "Intel" },
  ]},
  { label: "主流", ratio: "50-100x", items: [
    { name: "Core i5-13400F", score: 430, brand: "Intel" },
    { name: "Ryzen 5 5600X", score: 400, brand: "AMD" },
    { name: "Core i5-12400F", score: 390, brand: "Intel" },
    { name: "Core i5-11400F", score: 360, brand: "Intel" },
    { name: "Ryzen 5 3600", score: 350, brand: "AMD" },
    { name: "Core i5-10400F", score: 330, brand: "Intel" },
  ]},
  { label: "入门", ratio: "25-50x", items: [
    { name: "Core i3-12100F", score: 290, brand: "Intel" },
    { name: "Ryzen 5 5600G", score: 275, brand: "AMD" },
    { name: "Core i3-10100F", score: 260, brand: "Intel" },
    { name: "Ryzen 3 3200G", score: 230, brand: "AMD" },
    { name: "Ryzen 3 3100", score: 225, brand: "AMD" },
    { name: "Pentium Gold G7400", score: 200, brand: "Intel" },
  ]},
  { label: "低端", ratio: "10-25x", items: [
    { name: "Celeron G6900", score: 160, brand: "Intel" },
    { name: "Ryzen 3 2200G", score: 155, brand: "AMD" },
    { name: "Pentium G4560", score: 130, brand: "Intel" },
    { name: "Core 2 Quad Q9550", score: 110, brand: "Intel" },
    { name: "Athlon X4 950", score: 105, brand: "AMD" },
    { name: "Pentium Gold G5400", score: 100, brand: "Intel" },
    { name: "FX-8350", score: 95, brand: "AMD" },
    { name: "Phenom II X6 1100T", score: 85, brand: "AMD" },
  ]},
  { label: "过时", ratio: "5-10x", items: [
    { name: "Core 2 Duo E8400", score: 55, brand: "Intel" },
    { name: "Core i5-750", score: 50, brand: "Intel" },
    { name: "Athlon 64 X2 6000+", score: 42, brand: "AMD" },
    { name: "Pentium E5300", score: 38, brand: "Intel" },
    { name: "Core 2 Duo E7300", score: 32, brand: "Intel" },
    { name: "Athlon 64 X2 4200+", score: 28, brand: "AMD" },
    { name: "Pentium D 820", score: 22, brand: "Intel" },
    { name: "Sempron 2600+", score: 18, brand: "AMD" },
    { name: "Pentium 4 3.0E", score: 14, brand: "Intel" },
  ]},
];

// ====================== CPU 移动端 ======================
export const CPU_MOBILE_TIERS: TierLevel[] = [
  { label: "顶级旗舰", ratio: "400x+", items: [
    { name: "Apple M4", score: 1000, brand: "Apple" },
    { name: "Snapdragon 8 Elite", score: 940, brand: "Qualcomm" },
    { name: "Dimensity 9400", score: 910, brand: "MediaTek" },
    { name: "Apple M3", score: 860, brand: "Apple" },
  ]},
  { label: "高端", ratio: "200-400x", items: [
    { name: "Core Ultra 9 285H", score: 800, brand: "Intel" },
    { name: "Snapdragon 8 Gen 3", score: 780, brand: "Qualcomm" },
    { name: "Ryzen AI 9 HX 370", score: 770, brand: "AMD" },
    { name: "Apple M2", score: 720, brand: "Apple" },
    { name: "Core Ultra 7 258V", score: 710, brand: "Intel" },
    { name: "Dimensity 9300+", score: 700, brand: "MediaTek" },
  ]},
  { label: "中高端", ratio: "100-200x", items: [
    { name: "Ryzen 9 8945HS", score: 620, brand: "AMD" },
    { name: "Core Ultra 7 155H", score: 610, brand: "Intel" },
    { name: "Snapdragon X Elite", score: 600, brand: "Qualcomm" },
    { name: "Apple M1", score: 580, brand: "Apple" },
    { name: "Ryzen 7 8845HS", score: 560, brand: "AMD" },
    { name: "Core i7-13700H", score: 550, brand: "Intel" },
    { name: "Dimensity 8300", score: 530, brand: "MediaTek" },
  ]},
  { label: "主流", ratio: "50-100x", items: [
    { name: "Core i7-12700H", score: 480, brand: "Intel" },
    { name: "Ryzen 7 7840HS", score: 470, brand: "AMD" },
    { name: "Core Ultra 5 125H", score: 450, brand: "Intel" },
    { name: "Snapdragon 7+ Gen 3", score: 430, brand: "Qualcomm" },
    { name: "Core i5-13500H", score: 410, brand: "Intel" },
    { name: "Ryzen 5 7640HS", score: 400, brand: "AMD" },
  ]},
  { label: "入门", ratio: "25-50x", items: [
    { name: "Core i5-12450H", score: 330, brand: "Intel" },
    { name: "Ryzen 5 7530U", score: 310, brand: "AMD" },
    { name: "Snapdragon 7 Gen 3", score: 300, brand: "Qualcomm" },
    { name: "Core i5-1135G7", score: 270, brand: "Intel" },
    { name: "Ryzen 3 7330U", score: 250, brand: "AMD" },
    { name: "Snapdragon 6 Gen 1", score: 230, brand: "Qualcomm" },
    { name: "Core i3-1115G4", score: 210, brand: "Intel" },
    { name: "Dimensity 7200", score: 200, brand: "MediaTek" },
  ]},
];

// ====================== GPU 桌面端 ======================
export const GPU_DESKTOP_TIERS: TierLevel[] = [
  { label: "顶级旗舰", ratio: "300x+", items: [
    { name: "RTX 5090D", score: 1000, brand: "NVIDIA" },
    { name: "RTX 5090", score: 980, brand: "NVIDIA" },
    { name: "RTX 5080", score: 850, brand: "NVIDIA" },
  ]},
  { label: "旗舰", ratio: "200-300x", items: [
    { name: "RTX 4090", score: 820, brand: "NVIDIA" },
    { name: "RX 7900 XTX", score: 780, brand: "AMD" },
    { name: "RTX 5070 Ti", score: 750, brand: "NVIDIA" },
    { name: "RX 7900 XT", score: 710, brand: "AMD" },
    { name: "RTX 4080 Super", score: 690, brand: "NVIDIA" },
    { name: "RTX 4080", score: 670, brand: "NVIDIA" },
    { name: "RX 6950 XT", score: 630, brand: "AMD" },
  ]},
  { label: "高端", ratio: "150-200x", items: [
    { name: "RTX 4070 Ti Super", score: 580, brand: "NVIDIA" },
    { name: "RX 7900 GRE", score: 555, brand: "AMD" },
    { name: "RTX 4070 Ti", score: 545, brand: "NVIDIA" },
    { name: "RX 6900 XT", score: 530, brand: "AMD" },
    { name: "RTX 5070", score: 520, brand: "NVIDIA" },
    { name: "RTX 4070 Super", score: 500, brand: "NVIDIA" },
  ]},
  { label: "中高端", ratio: "100-150x", items: [
    { name: "RX 7800 XT", score: 440, brand: "AMD" },
    { name: "RTX 4070", score: 420, brand: "NVIDIA" },
    { name: "RX 6800 XT", score: 410, brand: "AMD" },
    { name: "RX 6800", score: 380, brand: "AMD" },
    { name: "RTX 3070 Ti", score: 370, brand: "NVIDIA" },
    { name: "RTX 3070", score: 355, brand: "NVIDIA" },
    { name: "Arc B580", score: 350, brand: "Intel" },
  ]},
  { label: "主流", ratio: "50-100x", items: [
    { name: "RTX 4060 Ti", score: 330, brand: "NVIDIA" },
    { name: "RX 7700 XT", score: 325, brand: "AMD" },
    { name: "RTX 3060 Ti", score: 300, brand: "NVIDIA" },
    { name: "RX 6700 XT", score: 290, brand: "AMD" },
    { name: "RTX 4060", score: 270, brand: "NVIDIA" },
    { name: "RX 7600", score: 255, brand: "AMD" },
    { name: "RTX 3060", score: 240, brand: "NVIDIA" },
    { name: "Arc A750", score: 235, brand: "Intel" },
  ]},
  { label: "入门", ratio: "25-50x", items: [
    { name: "GTX 1660 Super", score: 190, brand: "NVIDIA" },
    { name: "RX 580", score: 185, brand: "AMD" },
    { name: "RX 570", score: 165, brand: "AMD" },
    { name: "GTX 1650", score: 155, brand: "NVIDIA" },
    { name: "GTX 1060 6G", score: 150, brand: "NVIDIA" },
    { name: "RX 5500 XT", score: 145, brand: "AMD" },
    { name: "Arc A380", score: 110, brand: "Intel" },
  ]},
  { label: "过时", ratio: "10-25x", items: [
    { name: "GTX 970", score: 95, brand: "NVIDIA" },
    { name: "R9 290X", score: 85, brand: "AMD" },
    { name: "GTX 780 Ti", score: 78, brand: "NVIDIA" },
    { name: "R9 280X", score: 72, brand: "AMD" },
    { name: "GTX 770", score: 65, brand: "NVIDIA" },
    { name: "HD 7850", score: 52, brand: "AMD" },
    { name: "GTX 750 Ti", score: 48, brand: "NVIDIA" },
    { name: "R7 260X", score: 42, brand: "AMD" },
    { name: "GTX 650 Ti", score: 32, brand: "NVIDIA" },
  ]},
];

// ====================== GPU 移动端 ======================
export const GPU_MOBILE_TIERS: TierLevel[] = [
  { label: "顶级旗舰", ratio: "300x+", items: [
    { name: "RTX 5090M (Laptop)", score: 980, brand: "NVIDIA" },
    { name: "RTX 5080M (Laptop)", score: 850, brand: "NVIDIA" },
  ]},
  { label: "旗舰", ratio: "200-300x", items: [
    { name: "RTX 4090M (Laptop)", score: 800, brand: "NVIDIA" },
    { name: "RTX 5070 TiM (Laptop)", score: 720, brand: "NVIDIA" },
    { name: "Apple M4 Max GPU", score: 710, brand: "Apple" },
    { name: "RTX 4080M (Laptop)", score: 680, brand: "NVIDIA" },
  ]},
  { label: "高端", ratio: "150-200x", items: [
    { name: "Apple M3 Max GPU", score: 630, brand: "Apple" },
    { name: "RTX 4070M (Laptop)", score: 550, brand: "NVIDIA" },
    { name: "RX 7800M", score: 520, brand: "AMD" },
    { name: "Apple M2 Max GPU", score: 500, brand: "Apple" },
    { name: "RTX 3080 TiM (Laptop)", score: 490, brand: "NVIDIA" },
    { name: "RTX 5060M (Laptop)", score: 470, brand: "NVIDIA" },
  ]},
  { label: "中高端", ratio: "100-150x", items: [
    { name: "Apple M4 Pro GPU", score: 440, brand: "Apple" },
    { name: "RTX 4060M (Laptop)", score: 410, brand: "NVIDIA" },
    { name: "RTX 3070 TiM (Laptop)", score: 395, brand: "NVIDIA" },
    { name: "RX 7600M XT", score: 380, brand: "AMD" },
    { name: "Apple M3 Pro GPU", score: 375, brand: "Apple" },
  ]},
  { label: "主流", ratio: "50-100x", items: [
    { name: "RTX 3060M (Laptop)", score: 310, brand: "NVIDIA" },
    { name: "Apple M2 Pro GPU", score: 295, brand: "Apple" },
    { name: "RTX 4050M (Laptop)", score: 285, brand: "NVIDIA" },
    { name: "RX 6600M", score: 265, brand: "AMD" },
    { name: "Apple M4 GPU", score: 260, brand: "Apple" },
    { name: "Arc A770M", score: 250, brand: "Intel" },
    { name: "Apple M3 GPU", score: 245, brand: "Apple" },
    { name: "GTX 1660 TiM (Laptop)", score: 225, brand: "NVIDIA" },
  ]},
  { label: "入门", ratio: "25-50x", items: [
    { name: "Apple M2 GPU", score: 205, brand: "Apple" },
    { name: "GTX 1650M", score: 195, brand: "NVIDIA" },
    { name: "Apple M1 GPU", score: 185, brand: "Apple" },
    { name: "RX 5500M", score: 170, brand: "AMD" },
    { name: "Arc A370M", score: 155, brand: "Intel" },
    { name: "MX 550", score: 125, brand: "NVIDIA" },
    { name: "Intel Iris Xe (96EU)", score: 115, brand: "Intel" },
  ]},
  { label: "过时", ratio: "10-25x", items: [
    { name: "MX 450", score: 95, brand: "NVIDIA" },
    { name: "Vega 8 (Ryzen 5000)", score: 82, brand: "AMD" },
    { name: "Intel UHD 770", score: 70, brand: "Intel" },
    { name: "MX 350", score: 58, brand: "NVIDIA" },
    { name: "Vega 6", score: 50, brand: "AMD" },
    { name: "Intel UHD 630", score: 38, brand: "Intel" },
  ]},
];

export function getTiers(platform: "desktop" | "mobile", component: "cpu" | "gpu"): TierLevel[] {
  if (platform === "desktop" && component === "cpu") return CPU_DESKTOP_TIERS;
  if (platform === "desktop" && component === "gpu") return GPU_DESKTOP_TIERS;
  if (platform === "mobile" && component === "cpu") return CPU_MOBILE_TIERS;
  return GPU_MOBILE_TIERS;
}
