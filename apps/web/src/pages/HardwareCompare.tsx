import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

const COLORS = ["#e74c3c", "#3498db", "#27ae60", "#e67e22", "#9b59b6", "#1abc9c"];

interface Chip {
  id: string; name: string; brand: string; type: string; tier: string; year: number;
  process: string; arch: string; tdp: number;
  [key: string]: unknown;
}

export default function HardwareCompare() {
  const [params] = useSearchParams();
  const ids = (params.get("ids") || "").split(",").filter(Boolean);
  const [items, setItems] = useState<Chip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length < 2) { setLoading(false); return; }
    setLoading(true);
    fetch("/api/v1/hardware/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids),
    })
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .finally(() => setLoading(false));
  }, [params]);

  if (ids.length < 2) {
    return (
      <div>
        <h1>⚖️ 硬件对比</h1>
        <p className="muted">请先在 <Link to="/hardware">硬件数据库</Link> 中选择至少 2 个芯片，再点击"对比所选"。</p>
      </div>
    );
  }

  const isCpu = items[0]?.type === "cpu";
  const metrics = isCpu
    ? [
        { key: "gb6_single", label: "GB6 单核" },
        { key: "gb6_multi", label: "GB6 多核" },
        { key: "cb_r23_single", label: "R23 单核" },
        { key: "cb_r23_multi", label: "R23 多核" },
      ]
    : [
        { key: "ts_score", label: "Time Spy" },
        { key: "sn_score", label: "Steel Nomad" },
        { key: "sn_dx12", label: "SN DX12" },
      ];

  // Radar data: normalize each metric to 0-100 relative to max
  const radarData = metrics.map(m => {
    const maxVal = Math.max(...items.map(c => Number(c[m.key]) || 0));
    const entry: Record<string, string | number> = { metric: m.label };
    items.forEach(c => {
      entry[c.name] = maxVal > 0 ? Math.round(((Number(c[m.key]) || 0) / maxVal) * 100) : 0;
    });
    return entry;
  });

  // Bar data: absolute scores
  const barData = metrics.map(m => {
    const entry: Record<string, string | number> = { metric: m.label };
    items.forEach(c => { entry[c.name] = Number(c[m.key]) || 0; });
    return entry;
  });

  return (
    <div>
      <h1>⚖️ 硬件对比</h1>
      <p className="muted">并排比较 {items.length} 款芯片的性能表现。</p>

      {/* 对比表格 */}
      <div className="card" style={{ marginBottom: 16, overflowX: "auto" }}>
        <h3>规格参数对比</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #eee" }}>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>参数</th>
              {items.map((c, i) => (
                <th key={c.id} style={{ padding: "8px 12px", textAlign: "center", color: COLORS[i % COLORS.length] }}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "品牌", key: "brand" },
              { label: "架构", key: "arch" },
              { label: "工艺", key: "process" },
              { label: "年份", key: "year" },
              { label: "TDP (W)", key: "tdp" },
              ...(isCpu
                ? [
                    { label: "核心", key: "cores" },
                    { label: "线程", key: "threads" },
                    { label: "加速频率 (GHz)", key: "boost_clock" },
                    { label: "内存", key: "memory" },
                  ]
                : [
                    { label: "显存 (GB)", key: "vram" },
                    { label: "显存类型", key: "vram_type" },
                    { label: "位宽 (bit)", key: "bus_width" },
                  ]),
              ...metrics.map(m => ({ label: m.label, key: m.key })),
            ].map(row => (
              <tr key={row.key} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "8px 12px", color: "#888", fontSize: 13 }}>{row.label}</td>
                {items.map((c, i) => (
                  <td key={c.id} style={{ padding: "8px 12px", textAlign: "center", fontWeight: 500, color: COLORS[i % COLORS.length] }}>
                    {typeof c[row.key] === "number" ? (c[row.key] as number).toLocaleString() : String(c[row.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 雷达图 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>性能雷达图（归一化对比）</h3>
        <ResponsiveContainer width="100%" height={360}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="#e0e0e0" />
            <PolarAngleAxis dataKey="metric" fontSize={12} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} fontSize={10} />
            {items.map((c, i) => (
              <Radar key={c.id} name={c.name} dataKey={c.name}
                stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} />
            ))}
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* 柱状图 */}
      <div className="card">
        <h3>跑分绝对值对比</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="metric" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip formatter={(v) => Number(v).toLocaleString()} />
            <Legend />
            {items.map((c, i) => (
              <Bar key={c.id} name={c.name} dataKey={c.name} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 16 }}>
        <Link to="/hardware" className="btn btn-ghost">← 返回硬件数据库</Link>
      </div>
    </div>
  );
}
