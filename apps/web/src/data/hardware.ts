import catalog from "./hardwareCatalog.json";

export type Chip = (typeof catalog.chips)[number];
export const chips: Chip[] = catalog.chips;
export const CHECKED_AT = catalog.checked_at;
export const CPU_METRICS = [
  { key: "gb7_single", label: "Geekbench 7 单核" },
  { key: "gb7_multi", label: "Geekbench 7 多核" },
];
export const GPU_METRICS = [{ key: "gb7_opencl", label: "Geekbench 7 OpenCL" }];
export function formatValue(value: unknown, unit = ""): string {
  if (value == null || value === "" || (typeof value === "number" && !Number.isFinite(value))) return "未公开 / 待核验";
  return `${typeof value === "number" ? value.toLocaleString() : String(value)}${unit}`;
}
