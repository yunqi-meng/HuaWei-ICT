import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

import { useResource } from "../hooks/useResource";
import { LoadingState, ErrorState, EmptyState } from "../components/AsyncState";
import PageHeader from "../components/PageHeader";

import { CPU_METRICS, GPU_METRICS } from "../data/hardware";
import HardwareSources from "../components/HardwareSources";

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
  id: string;
  name: string;
  brand: string;
  type: string;
  tier: string;
  year: number;
  [key: string]: unknown;
}

export default function HardwareRankings() {
  const [chipType, setChipType] = useState<"cpu" | "gpu">("cpu");
  const [metric, setMetric] = useState("gb7_multi");
  const metrics = chipType === "cpu" ? CPU_METRICS : GPU_METRICS;
  const activeMetric = metrics.some((item) => item.key === metric)
    ? metric
    : metrics[0].key;
  const { data, loading, error, reload } = useResource<{ items: Chip[] }>(
    `/hardware/rankings?type=${chipType}&metric=${activeMetric}`,
  );
  const items = data?.items || [];

  const chartData = items.slice(0, 12).map((c) => ({
    name: c.name.length > 18 ? c.name.slice(0, 16) + "…" : c.name,
    score: Number(c[activeMetric]) || 0,
    tier: c.tier,
    id: c.id,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="BENCHMARKS / 基准测试"
        title="硬件性能排行榜"
        description="选择同一基准指标，比较芯片表现。仅收录有来源的 Geekbench 7 成绩快照，不代表全部硬件或实时排名。"
      />

      <HardwareSources />
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div className="segmented" role="group" aria-label="排名芯片类型">
            {(["cpu", "gpu"] as const).map((t) => (
              <button
                key={t}
                aria-pressed={chipType === t}
                onClick={() => {
                  setChipType(t);
                  setMetric(t === "cpu" ? "gb7_multi" : "gb7_opencl");
                }}
              >
                {t === "cpu" ? "🔧 CPU 处理器" : "🎮 GPU 显卡"}
              </button>
            ))}
          </div>
          <select
            aria-label="排名测试指标"
            value={activeMetric}
            onChange={(e) => setMetric(e.target.value)}
            style={{
              padding: "9px 12px",
              borderRadius: 8,
              width: "auto",
              maxWidth: "100%",
            }}
          >
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="muted small">按所选成绩排序；颜色为项目分组，并非厂商等级</span>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title="暂无排名数据" />
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>前 12 名性能对比</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 8, right: 18, bottom: 8, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis type="number" fontSize={14} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={128}
                  fontSize={14}
                />
                <Tooltip
                  formatter={(v) => [
                    Number(v).toLocaleString(),
                    metrics.find((m) => m.key === activeMetric)?.label,
                  ]}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={TIER_COLORS[entry.tier] || "#888"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 8,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {Object.entries(TIER_LABELS).map(([k, v]) => (
                <span
                  key={k}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 14,
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: TIER_COLORS[k],
                      display: "inline-block",
                    }}
                  />
                  {v}
                </span>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>完整排名</h3>
            <div className="table-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "2px solid #eee",
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: "8px 12px" }}>排名</th>
                    <th style={{ padding: "8px 12px" }}>芯片</th>
                    <th style={{ padding: "8px 12px" }}>品牌</th>
                    <th style={{ padding: "8px 12px" }}>项目分组</th>
                    <th style={{ padding: "8px 12px" }}>年份</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>
                      {metrics.find((m) => m.key === activeMetric)?.label}
                    </th>
                    <th style={{ padding: "8px 12px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c, i) => (
                    <tr
                      key={c.id}
                      style={{ borderBottom: "1px solid #f0f0f0" }}
                    >
                      <td
                        style={{
                          padding: "8px 12px",
                          fontWeight: i < 3 ? 700 : 400,
                          fontSize: i < 3 ? 18 : 14,
                        }}
                      >
                        {i === 0
                          ? "🥇"
                          : i === 1
                            ? "🥈"
                            : i === 2
                              ? "🥉"
                              : `#${i + 1}`}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <Link
                          to={`/hardware/${c.id}`}
                          style={{
                            color: "var(--primary-dark)",
                            textDecoration: "none",
                            fontWeight: 500,
                          }}
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td style={{ padding: "8px 12px" }}>{c.brand}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 10,
                            fontSize: 14,
                            color: "#fff",
                            background: TIER_COLORS[c.tier] || "#888",
                          }}
                        >
                          {TIER_LABELS[c.tier] || c.tier}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px" }}>{c.year}</td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {(Number(c[activeMetric]) || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <Link
                          to={`/hardware/${c.id}`}
                          className="btn btn-ghost"
                          style={{ fontSize: 14, padding: "2px 8px" }}
                        >
                          详情
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
