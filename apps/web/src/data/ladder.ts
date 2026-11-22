import ladder from "./ladderCatalog.json";

export interface SourceRef { file: string; sheet: string; row: number; }
export interface SourceInfo { file: string; sha256: string; source_date: string; verification: string; }
export interface LadderCpu {
  id: string; name: string; brand: string; type: "cpu"; platform: "desktop" | "mobile";
  cores: number | null; threads: number | null; base_clock: number | null; boost_clock: number | null;
  tdp: number | null; cpuz_single: number | null; cpuz_multi: number | null; cpuz_composite: number | null;
  cpu_mark: number | null; checked_at: string;
  cores_text: string | null; power_text: string | null; has_benchmark: boolean;
  ranking_status: string | null; audit_note: string | null; reference_tier: string | null;
  spec_source_url: string | null; coverage_source: string | null; source_ref: SourceRef;
  benchmark_source: { title: string; url: string | null } | null;
}
export interface LadderGpu {
  id: string; name: string; brand: string; type: "gpu";
  platform: "desktop" | "integrated" | "mobile" | "workstation";
  arch: string | null; tier: string; tier_label: string;
  perf_x: number | null; theory_score: number | null; tdmark_ts: number | null; ts_estimated: boolean;
  tdp: number | null; process_nm: number | null; year: number | null;
  vram_gb: number | null; vram_text: string | null; vram_type: string | null;
  memory_bandwidth_gbs: number | null; memory_speed_gbps: number | null;
  boost_mhz: number | null; checked_at: string; has_benchmark: boolean;
  power_text: string | null; note: string | null; source_ref: SourceRef;
  benchmark_source: { title: string; url: string | null } | null;
}
interface LadderCatalog {
  schema_version: number; checked_at: string; origin: string;
  cpu_source: string; gpu_source: string; cpus: LadderCpu[]; gpus: LadderGpu[];
  sources: { cpu: SourceInfo; gpu: SourceInfo };
}

export const ladderData = ladder as unknown as LadderCatalog;
export const LADDER_CHECKED_AT = ladderData.checked_at;
export const ladderCpus = ladderData.cpus;
export const ladderGpus = ladderData.gpus;
export const rankedLadderCpus = ladderCpus.filter((c): c is LadderCpu & {
  cpuz_single: number; cpuz_multi: number; cpuz_composite: number;
} => c.has_benchmark && c.cpuz_single != null && c.cpuz_multi != null && c.cpuz_composite != null);
export const scoredLadderGpus = ladderGpus.filter((g): g is LadderGpu & { tdmark_ts: number } =>
  g.has_benchmark && g.tdmark_ts != null && !g.ts_estimated);

/** CPU-Z 参考成绩；不把参数索引型号计入排名。 */
export const LADDER_CPU_METRICS = [
  { key: "cpuz_composite", label: "CPU-Z 综合", estimated: false },
  { key: "cpuz_multi", label: "CPU-Z 多核", estimated: false },
  { key: "cpuz_single", label: "CPU-Z 单核", estimated: false },
] as const;
export type LadderCpuMetric = (typeof LADDER_CPU_METRICS)[number]["key"];

/** GPU 指标：只使用表内 Time Spy 参考成绩，不用理论分补齐缺失值。 */
export const LADDER_GPU_METRICS = [
  { key: "tdmark_ts", label: "3DMark Time Spy" },
] as const;

export const TIER_LABELS: Record<string, string> = {
  flagship: "旗舰", "high-end": "高端", "mid-range": "中性能",
  "low-end": "低性能", budget: "入门",
};

export function ladderGpuPlatformLabel(platform: string): string {
  return { desktop: "桌面显卡", integrated: "核显 / APU", mobile: "移动显卡", workstation: "工作站显卡" }[platform] ?? platform;
}

export function formatLadderValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "未提供";
  return value >= 1000 ? Math.round(value).toLocaleString() : String(value);
}

/** 每瓦性能（3DMark 分 / TDP），功耗缺失或估算分数不参与。 */
export function gpuPerfPerWatt(g: LadderGpu): number | null {
  if (!g.tdp || g.tdp <= 0 || g.ts_estimated || g.tdmark_ts == null || g.tdmark_ts <= 0) return null;
  return g.tdmark_ts / g.tdp;
}

/** 每瓦性能（当前 CPU-Z 指标 / 标称功耗）。 */
export function cpuPerfPerWatt(c: LadderCpu, metric: LadderCpuMetric = "cpuz_multi"): number | null {
  const score = c[metric];
  if (!c.tdp || c.tdp <= 0 || score == null || score <= 0) return null;
  return score / c.tdp;
}
