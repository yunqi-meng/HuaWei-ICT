import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const CPU_METRICS = [
  { key: "gb6_multi", label: "Geekbench 6 多核" },
  { key: "gb6_single", label: "Geekbench 6 单核" },
  { key: "cb_r23_multi", label: "Cinebench R23 多核" },
  { key: "cb_r23_single", label: "Cinebench R23 单核" },
];
const GPU_METRICS = [
  { key: "ts_score", label: "3DMark Time Spy" },
  { key: "sn_score", label: "Steel Nomad" },
  { key: "sn_dx12", label: "Steel Nomad DX12" },
];

const TIER_COLORS: Record<string, string> = {
  flagship: "#e74c3c",
  "high-end": "#e67e22",
  "mid-range": "#3498db",
  budget: "#27ae60",
};

const TIER_LABELS: Record<string, string> = {
  flagship: "旗舰",
  "high-end": "高端",
  "mid-range": "中端",
  budget: "入门",
};

interface Chip {
  id: string; name: string; brand: string; type: string; tier: string; year: number;
  [key: string]: unknown;
}

export default function HardwareRankings() {
  const [chipType, setChipType] = useState<"cpu" | "gpu">("cpu");
  const [metric, setMetric] = useState("gb6_multi");
  const [items, setItems] = useState<Chip[]>([]);
  const [loading, setLoading] = useState(true);

  const metrics = chipType === "cpu" ? CPU_METRICS : GPU_METRICS;

  useEffect(() => {
    if (chipType === "gpu" && !GPU_METRICS.find(m => m.key === metric)) setMetric("ts_score");
    if (chipType === "cpu" && !CPU_METRICS.find(m => m.key === metric)) setMetric("gb6_multi");
  }, [chipType]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/hardware/rankings?type=${chipType}&metric=${metric}`)
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .finally(() => setLoading(false));
  }, [chipType, metric]);

  const chartData = items.slice(0, 12).map(c => ({
    name: c.name.length > 18 ? c.name.slice(0, 16) + "…" : c.name,
    score: Number(c[metric]) || 0,
    tier: c.tier,
    id: c.id,
  }));

  return (
    <div>
      <h1>🏆 硬件性能排行榜</h1>
      <p className="muted">基于公开基准测试数据的芯片性能排名，帮你快速了解硬件水平。</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(["cpu", "gpu"] as const).map(t => (
              <button key={t} className={`btn ${chipType === t ? "" : "btn-ghost"}`}
                onClick={() => setChipType(t)}>
                {t === "cpu" ? "🔧 CPU 处理器" : "🎮 GPU 显卡"}
              </button>
            ))}
          </div>
          <select value={metric} onChange={e => setMetric(e.target.value)} style={{ padding: "6px 12px", borderRadius: 6 }}>
            {metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <span className="muted small">按性能从高到低排列</span>
        </div>
      </div>

      {loading ? <p>加载中…</p> : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>前 12 名性能对比</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" angle={-35} textAnchor="end" height={80} fontSize={11} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => [Number(v).toLocaleString(), metrics.find(m => m.key === metric)?.label]} />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={TIER_COLORS[entry.tier] || "#888"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 16, marginTop: 8, justifyContent: "center" }}>
              {Object.entries(TIER_LABELS).map(([k, v]) => (
                <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: TIER_COLORS[k], display: "inline-block" }} />
                  {v}
                </span>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>完整排名</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px" }}>排名</th>
                  <th style={{ padding: "8px 12px" }}>芯片</th>
                  <th style={{ padding: "8px 12px" }}>品牌</th>
                  <th style={{ padding: "8px 12px" }}>定位</th>
                  <th style={{ padding: "8px 12px" }}>年份</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>{metrics.find(m => m.key === metric)?.label}</th>
                  <th style={{ padding: "8px 12px" }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "8px 12px", fontWeight: i < 3 ? 700 : 400, fontSize: i < 3 ? 18 : 14 }}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <Link to={`/hardware/${c.id}`} style={{ color: "#2c3e50", textDecoration: "none", fontWeight: 500 }}>{c.name}</Link>
                    </td>
                    <td style={{ padding: "8px 12px" }}>{c.brand}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 10, fontSize: 12, color: "#fff",
                        background: TIER_COLORS[c.tier] || "#888",
                      }}>{TIER_LABELS[c.tier] || c.tier}</span>
                    </td>
                    <td style={{ padding: "8px 12px" }}>{c.year}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {(Number(c[metric]) || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <Link to={`/hardware/${c.id}`} className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }}>详情</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
