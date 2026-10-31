import { useState } from "react";
import { useSearchParams, useLocation } from "react-router-dom";

interface QualityItem {
  name: string;
  brand: string;
  score: number;
  image: string;
  vrm: string;
  pcb: string;
  cooling: string;
  warranty: string;
  pros: string[];
  cons: string[];
  price: string;
}

const DESKTOP_MB: QualityItem[] = [
  { name: "ROG MAXIMUS Z890 EXTREME", brand: "ROG/ASUS", score: 9.5, image: "/images/products/mb-rog-maximus.jpg",
    vrm: "24+1+2 相 110A DrMOS", pcb: "8 层 PCB、服务器级用料",
    cooling: "全覆盖 VRM 散热装甲 + 风扇", warranty: "3 年换新",
    pros: ["供电顶级", "扩展接口丰富", "BIOS 超频功能强"], cons: ["价格极高"], price: "¥8999+" },
  { name: "MPG Z890 CARBON WIFI", brand: "MSI", score: 8.8, image: "/images/products/mb-msi-carbon.jpg",
    vrm: "18+1+1 相 90A", pcb: "6 层 PCB、7W/mK 散热垫",
    cooling: "扩展散热片 + 热管", warranty: "3 年质保",
    pros: ["性价比高端", "M.2 散热好", "灯效同步"], cons: ["BIOS 功能略复杂"], price: "¥2999" },
  { name: "Z890 AORUS MASTER", brand: "GIGABYTE", score: 8.5, image: "/images/products/mb-gigabyte-aorus.jpg",
    vrm: "18+1+2 相 100A", pcb: "8 层 PCB",
    cooling: "Fins-Array 散热 + 热管", warranty: "4 年质保",
    pros: ["供电用料好", "4 年质保", "雷电4 接口"], cons: ["BIOS 体验一般"], price: "¥3299" },
  { name: "TUF GAMING Z890-PLUS", brand: "ASUS", score: 7.8, image: "/images/products/mb-tuf-gaming.jpg",
    vrm: "16+1+1 相 80A", pcb: "6 层 PCB、军规认证",
    cooling: "VRM 散热片", warranty: "3 年质保",
    pros: ["耐用稳定", "价格合理", "接口够用"], cons: ["超频能力有限"], price: "¥1799" },
  { name: "B850M MORTAR WIFI", brand: "MSI", score: 7.5, image: "/images/products/mb-msi-carbon.jpg",
    vrm: "12+2+1 相 80A", pcb: "6 层 PCB",
    cooling: "M.2 Shield Frozr", warranty: "3 年质保",
    pros: ["MATX 小板首选", "供电不错", "性价比高"], cons: ["扩展性有限"], price: "¥1299" },
  { name: "B760M-AYW WIFI", brand: "ASUS", score: 6.8, image: "/images/products/mb-tuf-gaming.jpg",
    vrm: "10+1 相 50A", pcb: "4 层 PCB",
    cooling: "基础散热片", warranty: "3 年质保",
    pros: ["入门首选", "便宜够用"], cons: ["供电一般", "扩展少"], price: "¥799" },
];

const DESKTOP_GPU: QualityItem[] = [
  { name: "ROG STRIX RTX 5090 O32G", brand: "ROG/ASUS", score: 9.6, image: "/images/products/gpu-rog-strix.jpg",
    vrm: "24+4 相供电", pcb: "自动制程 PCB、航天级用料",
    cooling: "轴流风扇 + 均热板 + 相变硅脂", warranty: "3 年质保",
    pros: ["散热顶级", "供电豪华", "静音好"], cons: ["价格昂贵", "体积巨大"], price: "¥19999+" },
  { name: "RTX 5090 FE (公版)", brand: "NVIDIA", score: 9.0, image: "/images/products/gpu-nvidia-fe.jpg",
    vrm: "高密度供电", pcb: "紧凑 PCB 设计",
    cooling: "双相变均热板 + 涡轮", warranty: "3 年质保",
    pros: ["做工精致", "体积小", "散热创新"], cons: ["难买到", "拆解不便"], price: "¥16499" },
  { name: "RTX 5080 SUPRIM LIQUID", brand: "MSI", score: 9.2, image: "/images/products/gpu-msi-suprim.jpg",
    vrm: "16+4 相", pcb: "高规格 PCB",
    cooling: "360mm 一体水冷", warranty: "3 年质保",
    pros: ["水冷散热极致", "温度极低", "性能释放充分"], cons: ["安装占空间", "价格高"], price: "¥9999" },
  { name: "RX 7900 XTX NITRO+", brand: "SAPPHIRE", score: 8.5, image: "/images/products/gpu-sapphire-nitro.jpg",
    vrm: "17 相供电", pcb: "高规格 PCB",
    cooling: "Tri-X 三风扇 + 热管", warranty: "3 年质保",
    pros: ["AMD 旗舰做工", "散热优秀", "接口丰富"], cons: ["功耗较高"], price: "¥7599" },
  { name: "RTX 4070 SUPER 旗舰", brand: "各AIB", score: 7.8, image: "/images/products/gpu-rtx4070s.jpg",
    vrm: "12-14 相", pcb: "6 层 PCB",
    cooling: "三风扇散热", warranty: "3 年质保",
    pros: ["主流甜品", "散热够用", "功耗低"], cons: ["用料不如旗舰"], price: "¥4599" },
];

const LAPTOPS: QualityItem[] = [
  { name: "MacBook Pro 16 M4 Max", brand: "Apple", score: 9.5, image: "/images/products/laptop-macbook.jpg",
    vrm: "统一内存架构", pcb: "高集成度主板",
    cooling: "均热板 + 双风扇", warranty: "1 年(可延保)",
    pros: ["做工顶级", "屏幕极佳", "续航超长", "性能强"], cons: ["价格极高", "扩展性差"], price: "¥25999+" },
  { name: "ROG 幻16 Air", brand: "ASUS", score: 8.8, image: "/images/products/laptop-rog-zephyrus.jpg",
    vrm: "高性能供电模组", pcb: "紧凑高密度",
    cooling: "液金导热 + 三风扇", warranty: "2 年质保",
    pros: ["轻薄高性能", "屏幕好", "散热优秀"], cons: ["高负载噪音较大"], price: "¥12999" },
  { name: "ThinkPad X1 Carbon", brand: "Lenovo", score: 8.5, image: "/images/products/laptop-thinkpad.jpg",
    vrm: "商务级供电", pcb: "碳纤维材质",
    cooling: "双风扇 + 热管", warranty: "3 年质保",
    pros: ["键盘手感极佳", "轻薄耐用", "接口齐全", "商务品质"], cons: ["性能释放保守"], price: "¥10999" },
  { name: "MateBook X Pro", brand: "HUAWEI", score: 8.3, image: "/images/products/laptop-matebook.jpg",
    vrm: "高效供电", pcb: "镁合金机身",
    cooling: "鲨鱼鳍风扇", warranty: "2 年质保",
    pros: ["屏幕顶级", "做工精致", "触控板好"], cons: ["接口较少"], price: "¥9999" },
  { name: "拯救者 Y9000P", brand: "Lenovo", score: 8.0, image: "/images/products/laptop-legion.jpg",
    vrm: "高性能供电", pcb: "标准主板",
    cooling: "霜刃散热系统 5.0", warranty: "2 年质保",
    pros: ["性能释放激进", "性价比高", "散热好"], cons: ["较重", "续航一般"], price: "¥8999" },
  { name: "RedmiBook Pro 15", brand: "Xiaomi", score: 7.2, image: "/images/products/laptop-redmibook.jpg",
    vrm: "标准供电", pcb: "金属机身",
    cooling: "双风扇", warranty: "2 年质保",
    pros: ["性价比高", "屏幕不错", "做工对得起价格"], cons: ["品牌溢价低", "售后网点少"], price: "¥4599" },
];

const SCORE_LABELS: Record<number, string> = {
  10: "完美", 9: "优秀", 8: "很好", 7: "良好", 6: "一般", 5: "中等", 4: "偏弱", 3: "较差",
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 9 ? "#e74c3c" : score >= 8 ? "#e67e22" : score >= 7 ? "#f1c40f" : "#27ae60";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 20, fontSize: 13, fontWeight: 700,
      color: "#fff", background: color,
    }}>
      {score.toFixed(1)}
    </span>
  );
}

function QualityCard({ item }: { item: QualityItem }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card" style={{ marginBottom: 12, cursor: "pointer" }}
      onClick={() => setExpanded(!expanded)}>
      <div style={{ display: "flex", gap: 16, alignItems: "start" }}>
        {/* 产品图 */}
        <div style={{
          width: 120, height: 90, borderRadius: 10, overflow: "hidden",
          flexShrink: 0, background: "#f0f0f0", border: "1px solid #e8e8e8",
        }}>
          <img
            src={item.image}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).parentElement!.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:28px">📦</div>';
            }}
          />
        </div>
        {/* 信息 */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{item.name}</div>
              <div className="muted small" style={{ marginTop: 2 }}>{item.brand} · {item.price}</div>
            </div>
            <ScoreBadge score={item.score} />
          </div>

          {/* 评分进度条 */}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {["vrm", "pcb", "cooling", "warranty"].map(key => {
              const label = key === "vrm" ? "供电" : key === "pcb" ? "用料" : key === "cooling" ? "散热" : "售后";
              return (
                <div key={key} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
                  <div style={{
                    height: 4, borderRadius: 2, marginTop: 4,
                    background: `linear-gradient(90deg, #667eea ${item.score * 10}%, #e8e8e8 ${item.score * 10}%)`,
                  }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #eee" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
            <div><span className="muted">供电用料：</span>{item.vrm}</div>
            <div><span className="muted">PCB/材质：</span>{item.pcb}</div>
            <div><span className="muted">散热设计：</span>{item.cooling}</div>
            <div><span className="muted">质保售后：</span>{item.warranty}</div>
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, color: "#27ae60", fontWeight: 600, marginBottom: 4 }}>✅ 优点</div>
              {item.pros.map(p => <div key={p} style={{ fontSize: 12, color: "#555" }}>• {p}</div>)}
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#e74c3c", fontWeight: 600, marginBottom: 4 }}>⚠️ 不足</div>
              {item.cons.map(p => <div key={p} style={{ fontSize: 12, color: "#555" }}>• {p}</div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuildQuality() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const pathPlatform = location.pathname.includes("mobile") ? "mobile" : location.pathname.includes("desktop") ? "desktop" : "";
  const platform = params.get("platform") || pathPlatform || "desktop";
  const category = params.get("category") || (platform === "desktop" ? "mb" : "laptop");

  const items = platform === "desktop"
    ? (category === "mb" ? DESKTOP_MB : DESKTOP_GPU)
    : LAPTOPS;

  const setParams2 = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([k, v]) => next.set(k, v));
    setParams(next);
  };

  return (
    <div>
      <h1>🔨 做工对比</h1>
      <p className="muted">从供电用料、PCB 设计、散热方案、售后保障多维度评价硬件做工品质。</p>

      {/* 切换标签 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ display: "flex", background: "#f0f2f5", borderRadius: 12, padding: 4 }}>
          {(["desktop", "mobile"] as const).map(p => (
            <button key={p} onClick={() => setParams2({ platform: p, category: p === "desktop" ? "mb" : "laptop" })} style={{
              padding: "10px 28px", borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 15, fontWeight: 600,
              background: platform === p ? "#fff" : "transparent",
              color: platform === p ? "#333" : "#888",
              boxShadow: platform === p ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
            }}>
              {p === "desktop" ? "🖥️ 桌面端" : "📱 移动端"}
            </button>
          ))}
        </div>

        {platform === "desktop" && (
          <div style={{ display: "flex", background: "#f0f2f5", borderRadius: 12, padding: 4 }}>
            {([
              { key: "mb", label: "🔧 主板" },
              { key: "gpu", label: "🎮 显卡" },
            ]).map(c => (
              <button key={c.key} onClick={() => setParams2({ category: c.key })} style={{
                padding: "10px 28px", borderRadius: 9, border: "none", cursor: "pointer",
                fontSize: 15, fontWeight: 600,
                background: category === c.key ? "#fff" : "transparent",
                color: category === c.key ? "#333" : "#888",
                boxShadow: category === c.key ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
              }}>
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 标题 */}
      <h2 style={{ marginBottom: 16, fontSize: 20 }}>
        {platform === "desktop"
          ? (category === "mb" ? "🖥️ 桌面端主板做工对比" : "🎮 桌面端显卡做工对比")
          : "📱 笔记本做工对比"}
      </h2>

      {/* 做工卡片列表 */}
      {items.map(item => <QualityCard key={item.name} item={item} />)}

      <div className="card" style={{ marginTop: 20, background: "#f0f7ff" }}>
        <h3 style={{ marginBottom: 8 }}>💡 做工评价说明</h3>
        <p style={{ fontSize: 13, color: "#666", lineHeight: 1.8, margin: 0 }}>
          评分综合考虑<b>供电相数与规格</b>、<b>PCB 层数与用料</b>、<b>散热方案设计</b>、<b>售后服务保障</b>四个维度。
          点击任意卡片可展开详细参数。评分仅供参考，实际选购还需结合价格与个人需求。
        </p>
      </div>
    </div>
  );
}
