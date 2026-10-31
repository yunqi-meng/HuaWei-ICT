import { useState, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useLocation, Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { getTiers, TierItem } from "../data/perfTiers";

const BRAND_COLORS: Record<string, string> = {
  Intel: "#0071c5", AMD: "#ed1c24", NVIDIA: "#76b900", Apple: "#555555",
  Qualcomm: "#3253dc", MediaTek: "#ff6900", Samsung: "#1428a0", Huawei: "#cf0a2c",
  Google: "#4285f4", Xiaomi: "#ff6900",
};

const LINE_COLORS = ["#e74c3c", "#3498db", "#27ae60", "#e67e22", "#9b59b6", "#1abc9c", "#e91e63", "#795548"];

// 天梯图路径
const TIER_IMAGES: Record<string, string> = {
  "desktop-cpu": "/images/cpu-tier-list.png",
  "desktop-gpu": "/images/gpu-tier-list.png",
};

export default function PerformanceCompare() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const pathPlatform = location.pathname.includes("phone") ? "phone" : location.pathname.includes("mobile") ? "mobile" : location.pathname.includes("desktop") ? "desktop" : "";
  const platform = (params.get("platform") || pathPlatform || "desktop") as "desktop" | "mobile" | "phone";
  const component = (params.get("component") || "cpu") as "cpu" | "gpu";
  const [mode, setMode] = useState<"tier" | "curve">("tier"); // tier=天梯图, curve=能耗曲线

  // 能耗曲线选中的芯片
  const [selected, setSelected] = useState<string[]>([]);
  // 天梯图缩放
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const tiers = useMemo(() => getTiers(platform, component), [platform, component]);
  const allItems = useMemo(() => tiers.flatMap(t => t.items), [tiers]);

  // 有能效数据的芯片
  const chipsWithEff = useMemo(() => allItems.filter(i => i.eff && i.eff.length > 0), [allItems]);

  // 能效曲线数据
  const curveData = useMemo(() => {
    if (selected.length === 0) return [];
    const maxPower = Math.max(...selected.flatMap(name => {
      const chip = allItems.find(i => i.name === name);
      return chip?.eff?.map(p => p.power) || [0];
    }), 1);
    // 生成统一的功耗刻度
    const steps = 30;
    const points: Record<string, number | string>[] = [];
    for (let i = 0; i <= steps; i++) {
      const power = (maxPower * i) / steps;
      const entry: Record<string, number | string> = { power: Math.round(power * 10) / 10 };
      selected.forEach(name => {
        const chip = allItems.find(i => i.name === name);
        if (chip?.eff) {
          // 线性插值
          const eff = chip.eff;
          let score = 0;
          if (power <= eff[0].power) {
            score = (power / eff[0].power) * eff[0].score;
          } else if (power >= eff[eff.length - 1].power) {
            score = eff[eff.length - 1].score;
          } else {
            for (let j = 0; j < eff.length - 1; j++) {
              if (power >= eff[j].power && power <= eff[j + 1].power) {
                const ratio = (power - eff[j].power) / (eff[j + 1].power - eff[j].power);
                score = eff[j].score + ratio * (eff[j + 1].score - eff[j].score);
                break;
              }
            }
          }
          entry[name] = Math.round(score);
        }
      });
      points.push(entry);
    }
    return points;
  }, [selected, allItems]);

  const toggleChip = useCallback((name: string) => {
    setSelected(prev => prev.includes(name)
      ? prev.filter(n => n !== name)
      : prev.length < 6 ? [...prev, name] : prev
    );
  }, []);

  // 天梯图缩放和拖拽
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(5, Math.max(0.5, z * delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const setPlatform = (p: string) => {
    const next = new URLSearchParams(params);
    next.set("platform", p);
    setParams(next);
    setMode("tier");
    setSelected([]);
    resetZoom();
  };
  const setComponent = (c: string) => {
    const next = new URLSearchParams(params);
    next.set("component", c);
    setParams(next);
    setSelected([]);
    resetZoom();
  };

  const tierImageKey = `${platform}-${component}`;
  const hasTierImage = !!TIER_IMAGES[tierImageKey];

  return (
    <div>
      <h1>📊 性能对比</h1>
      <p className="muted">天梯图总览 + 能耗曲线深度对比，支持缩放查看细节</p>

      {/* 控制栏 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
        {/* 平台切换 */}
        <div style={{ display: "flex", background: "#f0f2f5", borderRadius: 12, padding: 4 }}>
          {([
            { key: "desktop" as const, label: "🖥️ 桌面端" },
            { key: "mobile" as const, label: "💻 笔记本" },
            { key: "phone" as const, label: "📱 手机端" },
          ]).map(p => (
            <button key={p.key} onClick={() => setPlatform(p.key)} style={{
              padding: "10px 22px", borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 600,
              background: platform === p.key ? "#fff" : "transparent",
              color: platform === p.key ? "#333" : "#888",
              boxShadow: platform === p.key ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
            }}>{p.label}</button>
          ))}
        </div>
        {/* 组件切换 */}
        <div style={{ display: "flex", background: "#f0f2f5", borderRadius: 12, padding: 4 }}>
          {(["cpu", "gpu"] as const).map(c => (
            <button key={c} onClick={() => setComponent(c)} style={{
              padding: "10px 22px", borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 600,
              background: component === c ? "#fff" : "transparent",
              color: component === c ? "#333" : "#888",
              boxShadow: component === c ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
            }}>{c === "cpu" ? "🔧 CPU" : "🎮 GPU"}</button>
          ))}
        </div>
        {/* 模式切换 */}
        <div style={{ display: "flex", background: "#f0f2f5", borderRadius: 12, padding: 4 }}>
          {([
            { key: "tier" as const, label: "📋 天梯图" },
            { key: "curve" as const, label: "📈 能耗曲线" },
          ]).map(m => (
            <button key={m.key} onClick={() => setMode(m.key)} style={{
              padding: "10px 22px", borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 600,
              background: mode === m.key ? "#fff" : "transparent",
              color: mode === m.key ? "#333" : "#888",
              boxShadow: mode === m.key ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
            }}>{m.label}</button>
          ))}
        </div>
      </div>

      {/* ==================== 天梯图模式 ==================== */}
      {mode === "tier" && (
        <>
          {hasTierImage ? (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {/* 缩放控制 */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                borderBottom: "1px solid #eee", background: "#fafbfc",
              }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {component === "cpu" ? "CPU 天梯图 V6.092" : "GPU 天梯图 V9.115"}
                </span>
                <span className="muted small">滚轮缩放 · 拖拽平移</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: 12 }}
                    onClick={() => setZoom(z => Math.min(5, z * 1.3))}>🔍 放大</button>
                  <button className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: 12 }}
                    onClick={() => setZoom(z => Math.max(0.5, z * 0.7))}>🔍 缩小</button>
                  <button className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: 12 }}
                    onClick={resetZoom}>↺ 重置</button>
                  <span style={{ alignSelf: "center", fontSize: 12, color: "#888", fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(zoom * 100)}%
                  </span>
                </div>
              </div>
              {/* 图片容器 */}
              <div
                ref={imgRef}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                  height: 650, overflow: "hidden", cursor: zoom > 1 ? "grab" : "default",
                  position: "relative", background: "#f5f5f5",
                }}
              >
                <img
                  src={TIER_IMAGES[tierImageKey]}
                  alt={component === "cpu" ? "CPU 天梯图" : "GPU 天梯图"}
                  draggable={false}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                    transition: isDragging.current ? "none" : "transform 0.15s ease",
                    maxWidth: "100%", height: "auto",
                    userSelect: "none", display: "block", margin: "0 auto",
                  }}
                />
              </div>
              <div style={{ padding: "10px 16px", background: "#fafbfc", borderTop: "1px solid #eee" }}>
                <p className="muted small" style={{ margin: 0 }}>
                  💡 提示：滚轮缩放、按住拖拽平移。切换到「📈 能耗曲线」模式可以选择型号对比能效。
                </p>
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <h3>{platform === "mobile" ? "笔记本" : "手机端"} {component === "cpu" ? "CPU" : "GPU"} 天梯</h3>
              <p className="muted">该分类暂无天梯图图片，下方为数据排名：</p>
            </div>
          )}

          {/* 无论有没有图片都显示数据排名 */}
          <div style={{ marginTop: 16 }}>
            {tiers.map((tier, ti) => (
              <div key={tier.label} className="card" style={{
                marginBottom: 12,
                borderLeft: `5px solid ${["#e74c3c","#e67e22","#f1c40f","#27ae60","#3498db","#9b59b6","#95a5a6"][ti % 7]}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <span style={{
                    padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, color: "#fff",
                    background: ["#e74c3c","#e67e22","#f1c40f","#27ae60","#3498db","#9b59b6","#95a5a6"][ti % 7],
                  }}>{tier.label}</span>
                  <span className="muted small">{tier.ratio}</span>
                  <span className="muted small" style={{ marginLeft: "auto" }}>{tier.items.length} 款</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {tier.items.map(item => (
                    <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                      <div style={{ width: 170, minWidth: 130, fontWeight: 500 }}>
                        <span style={{
                          display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                          background: BRAND_COLORS[item.brand] || "#888", marginRight: 6,
                        }} />
                        {item.name}
                      </div>
                      <div style={{ flex: 1, background: "#e8e8e8", borderRadius: 5, height: 20, position: "relative", overflow: "hidden" }}>
                        <div style={{
                          width: `${(item.score / 1000) * 100}%`, height: "100%", borderRadius: 5,
                          background: "linear-gradient(90deg, #667eea, #764ba2)",
                        }} />
                        <span style={{
                          position: "absolute", right: 8, top: 1, fontSize: 11,
                          fontWeight: 600, color: "#555",
                        }}>{item.score}</span>
                      </div>
                      {item.eff && (
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}
                          onClick={() => { toggleChip(item.name); setMode("curve"); }}>
                          📈
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ==================== 能耗曲线模式 ==================== */}
      {mode === "curve" && (
        <>
          {/* 芯片选择 */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 10 }}>选择要对比的芯片（最多 6 个）</h3>
            <p className="muted small" style={{ marginBottom: 12 }}>
              点击选择芯片，下方会显示它们的能耗曲线对比。曲线越靠左上越好（低功耗高性能）。
            </p>
            {chipsWithEff.length === 0 ? (
              <p className="muted">该分类暂无能效数据</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {chipsWithEff.map(chip => {
                  const isSelected = selected.includes(chip.name);
                  const colorIndex = selected.indexOf(chip.name);
                  return (
                    <button
                      key={chip.name}
                      onClick={() => toggleChip(chip.name)}
                      style={{
                        padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontSize: 13,
                        border: isSelected ? `2px solid ${LINE_COLORS[colorIndex % LINE_COLORS.length]}` : "1px solid #ddd",
                        background: isSelected ? `${LINE_COLORS[colorIndex % LINE_COLORS.length]}15` : "#fff",
                        fontWeight: isSelected ? 600 : 400,
                        transition: "all 0.15s",
                      }}
                    >
                      {isSelected && <span style={{ color: LINE_COLORS[colorIndex % LINE_COLORS.length], marginRight: 4 }}>●</span>}
                      {chip.name}
                    </button>
                  );
                })}
              </div>
            )}
            {selected.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <span className="muted small">已选 {selected.length} 个</span>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 12px" }}
                  onClick={() => setSelected([])}>清空</button>
              </div>
            )}
          </div>

          {/* 能耗曲线图 */}
          {selected.length > 0 && curveData.length > 0 && (
            <div className="card">
              <h3>⚡ 能耗曲线对比（性能 vs 功耗）</h3>
              <p className="muted small">
                曲线越高越好；相同性能下曲线越靠左（功耗越低）能效越好。
              </p>
              <ResponsiveContainer width="100%" height={450}>
                <LineChart data={curveData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis
                    dataKey="power"
                    label={{ value: "功耗 (W)", position: "insideBottom", offset: -2, fontSize: 12 }}
                    fontSize={12}
                  />
                  <YAxis
                    label={{ value: "性能得分", angle: -90, position: "insideLeft", fontSize: 12 }}
                    fontSize={12}
                  />
                  <Tooltip
                    formatter={(value, name) => [`${value} 分`, String(name)]}
                    labelFormatter={(label) => `功耗: ${label}W`}
                  />
                  <Legend />
                  {selected.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {selected.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📈</div>
              <h3>选择芯片查看能耗曲线</h3>
              <p className="muted">从上方选择 2-6 个芯片进行对比</p>
            </div>
          )}

          {/* 能效排名表 */}
          {selected.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>📋 选中芯片能效对比</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
                    <th style={{ padding: "8px 12px" }}>芯片</th>
                    <th style={{ padding: "8px 12px" }}>品牌</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>峰值性能</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>峰值功耗</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>能效比 (分/瓦)</th>
                    <th style={{ padding: "8px 12px" }}>曲线</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.map((name, i) => {
                    const chip = allItems.find(c => c.name === name);
                    if (!chip?.eff) return null;
                    const last = chip.eff[chip.eff.length - 1];
                    const perfPerWatt = last.power > 0 ? (last.score / last.power).toFixed(1) : "—";
                    return (
                      <tr key={name} style={{ borderBottom: "1px solid #f5f5f5" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                          <span style={{ color: LINE_COLORS[i % LINE_COLORS.length], marginRight: 6 }}>●</span>
                          {name}
                        </td>
                        <td style={{ padding: "8px 12px" }}>{chip.brand}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{last.score}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{last.power}W</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>{perfPerWatt}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <svg width="80" height="30" viewBox="0 0 80 30">
                            <polyline
                              points={chip.eff.map(p => {
                                const x = (p.power / last.power) * 75 + 2;
                                const y = 28 - (p.score / last.score) * 25;
                                return `${x},${y}`;
                              }).join(" ")}
                              fill="none"
                              stroke={LINE_COLORS[i % LINE_COLORS.length]}
                              strokeWidth="1.5"
                            />
                          </svg>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* 底部链接 */}
      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link to="/hardware/compare" className="btn btn-ghost">⚖️ 多芯片详细对比</Link>
        <Link to="/hardware" className="btn btn-ghost">🔍 硬件数据库</Link>
      </div>
    </div>
  );
}
