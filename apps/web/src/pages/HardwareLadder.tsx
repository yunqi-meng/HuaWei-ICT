import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import PageHeader from "../components/PageHeader";
import { EmptyState } from "../components/AsyncState";
import {
  ladderData, ladderCpus, ladderGpus, rankedLadderCpus, scoredLadderGpus, LADDER_CHECKED_AT,
  LADDER_CPU_METRICS, LADDER_GPU_METRICS,
  TIER_LABELS, ladderGpuPlatformLabel, formatLadderValue,
  gpuPerfPerWatt, cpuPerfPerWatt, type LadderCpu, type LadderGpu, type LadderCpuMetric,
} from "../data/ladder";

const TIER_COLORS: Record<string, string> = {
  flagship: "#e74c3c", "high-end": "#e67e22", "mid-range": "#3498db",
  "low-end": "#8e6db3", budget: "#27ae60",
};
const measuredGpuCount = scoredLadderGpus.length;

type ChipType = "cpu" | "gpu";
type SortKey = "score" | "per_watt";

export default function HardwareLadder() {
  const [chipType, setChipType] = useState<ChipType>("cpu");
  const [metric, setMetric] = useState("cpuz_composite");
  const [platform, setPlatform] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");

  const metrics = chipType === "cpu" ? LADDER_CPU_METRICS : LADDER_GPU_METRICS;
  const activeMetric = metrics.some((m) => m.key === metric) ? metric : metrics[0].key;

  const brands = useMemo(() => {
    const pool = chipType === "cpu" ? ladderCpus : ladderGpus;
    return [...new Set(pool.map((c) => c.brand))].sort();
  }, [chipType]);

  const platforms = useMemo(() => {
    if (chipType === "cpu") return ["desktop", "mobile"];
    return ["desktop", "integrated", "mobile", "workstation"];
  }, [chipType]);

  const rows = useMemo(() => {
    let items: (LadderCpu | LadderGpu)[] = chipType === "cpu" ? [...rankedLadderCpus] : [...scoredLadderGpus];
    if (platform) items = items.filter((c) => c.platform === platform);
    if (brand) items = items.filter((c) => c.brand === brand);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter((c) => c.name.toLowerCase().includes(q) || c.brand.toLowerCase().includes(q));
    }
    const scoreOf = (c: LadderCpu | LadderGpu): number => {
      const v = (c as unknown as Record<string, unknown>)[activeMetric];
      return typeof v === "number" ? v : 0;
    };
    const wattOf = (c: LadderCpu | LadderGpu): number | null =>
      c.type === "cpu" ? cpuPerfPerWatt(c, activeMetric as LadderCpuMetric) : gpuPerfPerWatt(c);
    const ranked = items
      .map((c) => ({ chip: c, score: scoreOf(c), perWatt: wattOf(c) }))
      .filter((r) => r.score > 0 && (sortKey !== "per_watt" || r.perWatt != null));
    ranked.sort((a, b) =>
      sortKey === "per_watt" ? (b.perWatt ?? 0) - (a.perWatt ?? 0) : b.score - a.score);
    return ranked;
  }, [chipType, platform, brand, query, activeMetric, sortKey]);

  const chartData = rows.slice(0, 15).map(({ chip, score, perWatt }) => ({
    name: chip.name.length > 20 ? chip.name.slice(0, 18) + "…" : chip.name,
    score: Math.round((sortKey === "per_watt" ? perWatt! : score) * 100) / 100,
    tier: (chip as LadderGpu).tier || "mid-range",
    id: chip.id,
  }));

  const metricLabel = metrics.find((m) => m.key === activeMetric)?.label || activeMetric;
  const chartLabel = `${metricLabel}${sortKey === "per_watt" ? " / W" : ""}`;

  return (
    <div>
      <PageHeader
        eyebrow="LADDER / 天梯排行"
        title="CPU / GPU 全世代天梯"
        description={`按用户工作簿中的 CPU-Z 与 Time Spy 参考成绩分别排名；缺少成绩的型号仅进入规格库。数据导入日期 ${LADDER_CHECKED_AT}。`}
        actions={<Link className="btn" to="/hardware/catalog">浏览全部规格 →</Link>}
      />
      <aside className="notice subtle" style={{ display: "block", marginBottom: 16 }}>
        <p>{ladderData.origin}</p>
        <p>CPU：{ladderData.cpu_source}；GPU：{ladderData.gpu_source}。</p>
      </aside>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 14 }}>
          <span>CPU 型号：<strong>{ladderCpus.length}</strong>（{rankedLadderCpus.length} 款有 CPU-Z 成绩）</span>
          <span>显卡型号：<strong>{ladderGpus.length}</strong></span>
          <span>Time Spy 参考成绩：<strong>{measuredGpuCount}</strong></span>
          <span className="muted">缺少跑分（不计名次）：<strong>{ladderGpus.length - measuredGpuCount}</strong></span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="segmented" role="group" aria-label="天梯芯片类型">
            {(["cpu", "gpu"] as const).map((t) => (
              <button
                key={t}
                aria-pressed={chipType === t}
                onClick={() => {
                  setChipType(t);
                  setMetric(t === "cpu" ? "cpuz_composite" : "tdmark_ts");
                  setPlatform("");
                  setBrand("");
                }}
              >
                {t === "cpu" ? "🔧 CPU 处理器" : "🎮 GPU 显卡"}
              </button>
            ))}
          </div>
          <select
            aria-label="天梯测试指标"
            value={activeMetric}
            onChange={(e) => setMetric(e.target.value)}
            style={{ padding: "9px 12px", borderRadius: 8 }}
          >
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
          <select
            aria-label="平台筛选"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            style={{ padding: "9px 12px", borderRadius: 8 }}
          >
            <option value="">全部平台</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p === "desktop" ? "桌面" : p === "mobile" ? "移动" : ladderGpuPlatformLabel(p)}
              </option>
            ))}
          </select>
          <select
            aria-label="品牌筛选"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            style={{ padding: "9px 12px", borderRadius: 8 }}
          >
            <option value="">全部品牌</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <div className="segmented" role="group" aria-label="排序方式">
            <button aria-pressed={sortKey === "score"} onClick={() => setSortKey("score")}>按分数</button>
            <button aria-pressed={sortKey === "per_watt"} onClick={() => setSortKey("per_watt")}>按每瓦性能</button>
          </div>
          <input
            placeholder="搜索型号…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ padding: "9px 12px", borderRadius: 8 }}
            aria-label="搜索型号"
          />
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          名次仅统计表内有对应成绩的型号，不代表本站实测。每瓦参考值 = 分数 ÷ 标称功耗，功耗缺失不计算，不能代替实测能效。
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="没有符合条件的型号" description="尝试放宽平台或品牌筛选。" />
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>前 15 名 · {chartLabel}</h3>
            <ResponsiveContainer width="100%" height={440}>
              <BarChart layout="vertical" data={chartData} margin={{ top: 8, right: 18, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" fontSize={13} />
                <YAxis type="category" dataKey="name" width={150} fontSize={13} />
                <Tooltip formatter={(v) => [Number(v).toLocaleString(), chartLabel]} />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.id} fill={TIER_COLORS[entry.tier] || "#3498db"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {chipType === "gpu" && (
              <div style={{ display: "flex", gap: 16, marginTop: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {Object.entries(TIER_LABELS).map(([k, v]) => (
                  <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: TIER_COLORS[k], display: "inline-block" }} />
                    {v}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3>完整榜单（{rows.length} 款）</h3>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="可横向滚动的数据表">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "8px 12px" }}>排名</th>
                    <th style={{ padding: "8px 12px" }}>型号</th>
                    <th style={{ padding: "8px 12px" }}>品牌</th>
                    {chipType === "gpu" && <th style={{ padding: "8px 12px" }}>平台</th>}
                    {chipType === "gpu" && <th style={{ padding: "8px 12px" }}>档位</th>}
                    <th style={{ padding: "8px 12px" }}>功耗（W）</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>{metricLabel}</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>每瓦性能</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ chip, score, perWatt }, i) => (
                    <tr key={chip.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontWeight: i < 3 ? 700 : 400, fontSize: i < 3 ? 18 : 14 }}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </td>
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>{chip.name}</td>
                      <td style={{ padding: "8px 12px" }}>{chip.brand}</td>
                      {chipType === "gpu" && (
                        <td style={{ padding: "8px 12px" }}>{ladderGpuPlatformLabel(chip.platform)}</td>
                      )}
                      {chipType === "gpu" && (
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 10, fontSize: 13, color: "#fff",
                            background: TIER_COLORS[(chip as LadderGpu).tier] || "#3498db",
                          }}>
                            {TIER_LABELS[(chip as LadderGpu).tier] || (chip as LadderGpu).tier}
                          </span>
                        </td>
                      )}
                      <td style={{ padding: "8px 12px" }}>{formatLadderValue(chip.tdp)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {formatLadderValue(score)}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {perWatt == null ? "—" : (Math.round(perWatt * 100) / 100).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small" style={{ marginTop: 10 }}>
              数据来源：用户提供的天梯图综合全世代表格（{chipType === "cpu" ? "CPU-Z 为主口径，CPU Mark 仅交叉复核" : "3DMark Time Spy 与理论性能刻度"}）。
              <Link to="/hardware" style={{ marginLeft: 8 }}>查看核对过的型号数据库 →</Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
