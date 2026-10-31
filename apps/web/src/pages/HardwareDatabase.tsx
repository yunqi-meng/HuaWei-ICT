import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const TIER_LABELS: Record<string, string> = {
  flagship: "旗舰", "high-end": "高端", "mid-range": "中端", budget: "入门",
};
const TIER_COLORS: Record<string, string> = {
  flagship: "#e74c3c", "high-end": "#e67e22", "mid-range": "#3498db", budget: "#27ae60",
};

interface Chip {
  id: string; name: string; brand: string; type: string; tier: string; year: number;
  process: string; arch: string;
  [key: string]: unknown;
}

export default function HardwareDatabase() {
  const [items, setItems] = useState<Chip[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [tier, setTier] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (brand) params.set("brand", brand);
    if (tier) params.set("tier", tier);
    fetch(`/api/v1/hardware/chips?${params}`)
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .finally(() => setLoading(false));
  }, [q, type, brand, tier]);

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 6 ? [...prev, id] : prev);
  };

  return (
    <div>
      <h1>🔍 硬件数据库</h1>
      <p className="muted">查询 CPU / GPU 芯片详细规格与跑分数据，支持多选对比。</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="搜索芯片名称、品牌…" value={q} onChange={e => setQ(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd" }} />
          <select value={type} onChange={e => setType(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6 }}>
            <option value="">全部类型</option>
            <option value="cpu">CPU 处理器</option>
            <option value="gpu">GPU 显卡</option>
          </select>
          <select value={brand} onChange={e => setBrand(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6 }}>
            <option value="">全部品牌</option>
            <option value="Intel">Intel</option>
            <option value="AMD">AMD</option>
            <option value="Apple">Apple</option>
            <option value="NVIDIA">NVIDIA</option>
            <option value="Qualcomm">Qualcomm</option>
            <option value="MediaTek">MediaTek</option>
          </select>
          <select value={tier} onChange={e => setTier(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6 }}>
            <option value="">全部定位</option>
            <option value="flagship">旗舰</option>
            <option value="high-end">高端</option>
            <option value="mid-range">中端</option>
            <option value="budget">入门</option>
          </select>
        </div>
        {selected.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <span>已选 {selected.length} 个芯片</span>
            <Link to={`/hardware/compare?ids=${selected.join(",")}`} className="btn">⚖️ 对比所选</Link>
            <button className="btn btn-ghost" onClick={() => setSelected([])}>清空</button>
          </div>
        )}
      </div>

      {loading ? <p>加载中…</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {items.map(chip => (
            <div key={chip.id} className="card" style={{ cursor: "pointer", border: selected.includes(chip.id) ? "2px solid #3498db" : undefined }}
              onClick={() => toggleSelect(chip.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{chip.name}</div>
                  <div className="muted small">{chip.brand} · {chip.type === "cpu" ? "CPU" : "GPU"} · {chip.year}</div>
                </div>
                <span style={{
                  padding: "2px 8px", borderRadius: 10, fontSize: 11, color: "#fff",
                  background: TIER_COLORS[chip.tier] || "#888",
                }}>{TIER_LABELS[chip.tier] || chip.tier}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10, fontSize: 13 }}>
                <div><span className="muted">工艺：</span>{chip.process}</div>
                <div><span className="muted">架构：</span>{chip.arch}</div>
                {chip.type === "cpu" ? (
                  <>
                    <div><span className="muted">核心：</span>{String(chip.cores)}</div>
                    <div><span className="muted">TDP：</span>{String(chip.tdp)}W</div>
                    <div><span className="muted">GB6 多核：</span>{Number(chip.gb6_multi).toLocaleString()}</div>
                    <div><span className="muted">GB6 单核：</span>{Number(chip.gb6_single).toLocaleString()}</div>
                  </>
                ) : (
                  <>
                    <div><span className="muted">显存：</span>{String(chip.vram)}GB {String(chip.vram_type)}</div>
                    <div><span className="muted">TDP：</span>{String(chip.tdp)}W</div>
                    <div><span className="muted">Time Spy：</span>{Number(chip.ts_score).toLocaleString()}</div>
                    <div><span className="muted">总线：</span>{String(chip.bus_width)}bit</div>
                  </>
                )}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <Link to={`/hardware/${chip.id}`} className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={e => e.stopPropagation()}>查看详情</Link>
                <span className="muted small" style={{ alignSelf: "center" }}>
                  {selected.includes(chip.id) ? "✅ 已选中" : "点击卡片加入对比"}
                </span>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="muted">没有找到匹配的芯片，试试其他关键词。</p>}
        </div>
      )}
    </div>
  );
}
