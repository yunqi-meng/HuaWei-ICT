import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ScatterChart, Scatter, ZAxis,
} from "recharts";

const TIER_LABELS: Record<string, string> = {
  flagship: "旗舰", "high-end": "高端", "mid-range": "中端", budget: "入门",
};
const TIER_COLORS: Record<string, string> = {
  flagship: "#e74c3c", "high-end": "#e67e22", "mid-range": "#3498db", budget: "#27ae60",
};

interface Chip {
  id: string; name: string; brand: string; type: string; tier: string; year: number;
  process: string; arch: string; tdp: number;
  efficiency_points: { power: number; score: number }[];
  [key: string]: unknown;
}

export default function HardwareDetail() {
  const { id } = useParams<{ id: string }>();
  const [chip, setChip] = useState<Chip | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/v1/hardware/chips/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.code === "NOT_FOUND" || !d.id) setNotFound(true);
        else setChip(d);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>加载中…</p>;
  if (notFound || !chip) return (
    <div>
      <h1>未找到该芯片</h1>
      <Link to="/hardware" className="btn">← 返回硬件数据库</Link>
    </div>
  );

  const isCpu = chip.type === "cpu";
  const effData = (chip.efficiency_points || []).map(p => ({
    ...p,
    perfPerWatt: p.power > 0 ? Math.round(p.score / p.power) : 0,
  }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{chip.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {chip.brand} · {isCpu ? "CPU 处理器" : "GPU 显卡"} · {chip.year}
            <span style={{
              marginLeft: 10, padding: "2px 10px", borderRadius: 12, fontSize: 12, color: "#fff",
              background: TIER_COLORS[chip.tier] || "#888",
            }}>{TIER_LABELS[chip.tier] || chip.tier}</span>
          </p>
        </div>
        <Link to="/hardware" className="btn btn-ghost">← 返回列表</Link>
      </div>

      {/* 基本规格 */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>📋 基本规格</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {[
            { label: "架构", value: chip.arch },
            { label: "制程工艺", value: chip.process },
            { label: "热设计功耗 (TDP)", value: `${chip.tdp}W` },
            ...(isCpu
              ? [
                  { label: "核心配置", value: String(chip.cores) },
                  { label: "线程数", value: String(chip.threads) },
                  { label: "基础频率", value: `${chip.base_clock} GHz` },
                  { label: "加速频率", value: `${chip.boost_clock} GHz` },
                  { label: "内存支持", value: String(chip.memory) },
                ]
              : [
                  { label: "显存容量", value: `${chip.vram} GB` },
                  { label: "显存类型", value: String(chip.vram_type) },
                  { label: "显存位宽", value: `${chip.bus_width} bit` },
                ]),
          ].map(item => (
            <div key={item.label} style={{ background: "#f8f9fa", padding: "10px 14px", borderRadius: 8 }}>
              <div className="muted small">{item.label}</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 跑分成绩 */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>🏁 跑分成绩</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {(isCpu
            ? [
                { label: "Geekbench 6 单核", value: chip.gb6_single },
                { label: "Geekbench 6 多核", value: chip.gb6_multi },
                { label: "Cinebench R23 单核", value: chip.cb_r23_single },
                { label: "Cinebench R23 多核", value: chip.cb_r23_multi },
              ]
            : [
                { label: "3DMark Time Spy", value: chip.ts_score },
                { label: "Steel Nomad", value: chip.sn_score },
                { label: "Steel Nomad DX12", value: chip.sn_dx12 },
              ]
          ).map(item => (
            <div key={item.label} style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "#fff", padding: "14px 18px", borderRadius: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{item.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
                {(Number(item.value) || 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 能效曲线 */}
      {effData.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>⚡ 能效曲线（性能 vs 功耗）</h3>
          <p className="muted small">展示不同功耗下的性能表现。曲线越靠左上，能效越好（低功耗高性能）。</p>
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={effData} margin={{ top: 8, right: 20, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="power" label={{ value: "功耗 (W)", position: "insideBottom", offset: -2, fontSize: 12 }} fontSize={12} />
              <YAxis label={{ value: "性能得分", angle: -90, position: "insideLeft", fontSize: 12 }} fontSize={12} />
              <Tooltip
                formatter={(value, name) => [
                  name === "score" ? Number(value).toLocaleString() : value,
                  name === "score" ? "性能得分" : "性能/瓦",
                ]}
                labelFormatter={(label) => `功耗: ${label}W`}
              />
              <Legend formatter={(value) => value === "score" ? "性能得分" : "性能/瓦"} />
              <Line type="monotone" dataKey="score" stroke="#e74c3c" strokeWidth={2.5} dot={{ r: 5, fill: "#e74c3c" }} name="score" />
              <Line type="monotone" dataKey="perfPerWatt" stroke="#3498db" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: "#3498db" }} name="perfPerWatt" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 能效散点图 */}
      {effData.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>📊 能效散点图</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 8, right: 20, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="power" name="功耗" unit="W" fontSize={12} />
              <YAxis dataKey="score" name="性能" fontSize={12} />
              <ZAxis dataKey="perfPerWatt" name="性能/瓦" range={[40, 200]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }}
                formatter={(value, name) => [Number(value).toLocaleString(), name]} />
              <Scatter name={chip.name} data={effData} fill="#e74c3c" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <Link to="/hardware" className="btn btn-ghost">← 返回硬件数据库</Link>
        <Link to="/hardware/rankings" className="btn btn-ghost">查看排行榜</Link>
      </div>
    </div>
  );
}
