import { useState, useMemo } from "react";
import { useSearchParams, useLocation, Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { getTiers, TierLevel } from "../data/perfTiers";

const BRAND_COLORS: Record<string, string> = {
  Intel: "#0071c5", AMD: "#ed1c24", NVIDIA: "#76b900", Apple: "#555555",
  Qualcomm: "#3253dc", MediaTek: "#ff6900",
};

const TIER_BG = [
  "#fff0f0", "#fff5e8", "#fffbe8", "#f0fff4", "#f0f8ff", "#f5f0ff", "#f5f5f5",
];

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = (score / maxScore) * 100;
  return (
    <div style={{ background: "#e8e8e8", borderRadius: 6, height: 22, position: "relative", overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`, height: "100%", borderRadius: 6,
        background: "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
        transition: "width 0.5s ease",
      }} />
      <span style={{
        position: "absolute", right: 8, top: 1, fontSize: 12,
        fontWeight: 600, color: "#555", fontVariantNumeric: "tabular-nums",
      }}>{score}</span>
    </div>
  );
}

export default function PerformanceCompare() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const pathPlatform = location.pathname.includes("phone") ? "phone" : location.pathname.includes("mobile") ? "mobile" : location.pathname.includes("desktop") ? "desktop" : "";
  const platform = (params.get("platform") || pathPlatform || "desktop") as "desktop" | "mobile" | "phone";
  const component = (params.get("component") || "cpu") as "cpu" | "gpu";
  const [search, setSearch] = useState("");

  const tiers = useMemo(() => {
    let data = getTiers(platform, component);
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.map(tier => ({
        ...tier,
        items: tier.items.filter(item =>
          item.name.toLowerCase().includes(q) || item.brand.toLowerCase().includes(q)
        ),
      })).filter(tier => tier.items.length > 0);
    }
    return data;
  }, [platform, component, search]);

  const allItems = useMemo(() => tiers.flatMap(t => t.items), [tiers]);
  const maxScore = useMemo(() => Math.max(...allItems.map(i => i.score), 1), [allItems]);

  const top12 = useMemo(() =>
    [...allItems].sort((a, b) => b.score - a.score).slice(0, 12),
    [allItems]
  );

  const setPlatform = (p: string) => {
    const next = new URLSearchParams(params);
    next.set("platform", p);
    setParams(next);
  };
  const setComponent = (c: string) => {
    const next = new URLSearchParams(params);
    next.set("component", c);
    setParams(next);
  };

  return (
    <div>
      <h1>📊 性能对比</h1>
      <p className="muted">基于 CPU Benchmark 6.092 / GPU Benchmark 9.115 天梯图数据</p>

      {/* 切换标签 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {/* 平台切换 */}
        <div style={{ display: "flex", background: "#f0f2f5", borderRadius: 12, padding: 4 }}>
          {([
            { key: "desktop" as const, label: "🖥️ 桌面端" },
            { key: "mobile" as const, label: "💻 笔记本" },
            { key: "phone" as const, label: "📱 手机端" },
          ]).map(p => (
            <button key={p.key} onClick={() => setPlatform(p.key)} style={{
              padding: "10px 24px", borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 15, fontWeight: 600,
              background: platform === p.key ? "#fff" : "transparent",
              color: platform === p.key ? "#333" : "#888",
              boxShadow: platform === p.key ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.2s",
            }}>
              {p.label}
            </button>
          ))}
        </div>
        {/* 组件切换 */}
        <div style={{ display: "flex", background: "#f0f2f5", borderRadius: 12, padding: 4 }}>
          {(["cpu", "gpu"] as const).map(c => (
            <button key={c} onClick={() => setComponent(c)} style={{
              padding: "10px 28px", borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 15, fontWeight: 600,
              background: component === c ? "#fff" : "transparent",
              color: component === c ? "#333" : "#888",
              boxShadow: component === c ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.2s",
            }}>
              {c === "cpu" ? "🔧 CPU 处理器" : "🎮 GPU 显卡"}
            </button>
          ))}
        </div>
        {/* 搜索 */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索型号…"
          style={{
            padding: "10px 18px", borderRadius: 12, border: "1px solid #ddd",
            fontSize: 14, minWidth: 180, outline: "none",
          }}
        />
      </div>

      {/* Top 12 柱状图 */}
      {top12.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3>🏆 Top 12 性能对比</h3>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={top12} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" angle={-35} textAnchor="end" height={80} fontSize={11} />
              <YAxis fontSize={12} domain={[0, maxScore]} />
              <Tooltip formatter={(v) => [`${v} 分`, "性能得分"]} />
              <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                {top12.map((entry, i) => (
                  <Cell key={i} fill={BRAND_COLORS[entry.brand] || "#888"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 14, marginTop: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {[...new Set(top12.map(i => i.brand))].map(brand => (
              <span key={brand} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: BRAND_COLORS[brand], display: "inline-block" }} />
                {brand}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 天梯图 */}
      <div>
        {tiers.map((tier, ti) => (
          <div key={tier.label} className="card" style={{
            marginBottom: 14,
            borderLeft: `5px solid ${["#e74c3c","#e67e22","#f1c40f","#27ae60","#3498db","#9b59b6","#95a5a6"][ti % 7]}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{
                padding: "4px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, color: "#fff",
                background: ["#e74c3c","#e67e22","#f1c40f","#27ae60","#3498db","#9b59b6","#95a5a6"][ti % 7],
              }}>{tier.label}</span>
              <span className="muted small">性能倍率 {tier.ratio}</span>
              <span className="muted small" style={{ marginLeft: "auto" }}>{tier.items.length} 款</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tier.items.map(item => (
                <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 180, minWidth: 140, fontSize: 13, fontWeight: 500 }}>
                    <span style={{
                      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                      background: BRAND_COLORS[item.brand] || "#888", marginRight: 6,
                    }} />
                    {item.name}
                  </div>
                  <div style={{ flex: 1 }}>
                    <ScoreBar score={item.score} maxScore={maxScore} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {tiers.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <p className="muted">没有找到匹配的芯片</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <Link to="/hardware/compare" className="btn btn-ghost">⚖️ 多芯片对比</Link>
        <Link to="/hardware" className="btn btn-ghost">🔍 硬件数据库</Link>
      </div>
    </div>
  );
}
