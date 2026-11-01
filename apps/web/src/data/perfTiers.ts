/** Rankings derive exclusively from the shared, source-backed catalog. */
import { chips } from "./hardware";
export interface EffPoint { power: number; score: number; }
export interface TierItem {
  name: string; score: number; brand: string; eff?: EffPoint[];
  id?: string; benchmark?: number;
}
export interface TierLevel { label: string; ratio: string; items: TierItem[]; }
export function getTiers(platform: "desktop" | "mobile" | "phone", component: "cpu" | "gpu"): TierLevel[] {
  const metric = component === "cpu" ? "gb7_multi" : "gb7_opencl";
  const measured = chips.filter(c => c.platform === platform && c.type === component && c[metric] != null && c.benchmark_source)
    .sort((a,b) => (b[metric] || 0) - (a[metric] || 0));
  if (!measured.length) return [];
  const max = measured[0][metric]!;
  return [{ label: component === "cpu" ? "GB7 多核" : "GB7 OpenCL", ratio: "已收录最高分 = 1000", items: measured.map(c => ({
    id: c.id, name: c.name, brand: c.brand, score: Math.round(c[metric]! / max * 1000), benchmark: c[metric]!,
  })) }];
}

/** Zoomable image generated from the same ranking rows, never a stale poster. */
export function tierImage(tiers: TierLevel[], title: string, options: { subtitle?: string; footer?: string; precision?: number } = {}): string | undefined {
  const items = tiers.flatMap(t => t.items);
  if (!items.length) return undefined;
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
  const height = 180 + items.length * 72;
  const rows = items.map((c,i) => `<g transform="translate(24,${150+i*72})"><rect width="912" height="60" rx="10" fill="#fff3e5"/><rect x="440" y="14" width="${c.score/1000*320}" height="32" rx="5" fill="#e5782b"/><text x="14" y="37" font-size="21" fill="#492915">${i+1}. ${escape(c.name)}</text><text x="890" y="37" text-anchor="end" font-size="21" fill="#492915">${c.benchmark?.toLocaleString('zh-CN',{maximumFractionDigits:options.precision ?? 2}) ?? c.score}</text></g>`).join('');
  const subtitle=options.subtitle || `Geekbench 7 ${title.includes('GPU')?'OpenCL':'多核'} · 2026-11-01 核对快照 · 仅已收录型号`;
  const footer=options.footer || '来源 browser.geekbench.com · 非实时排名 · OpenCL 不代表游戏帧率';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${height}" viewBox="0 0 960 ${height}"><rect width="960" height="${height}" fill="#fffdf9"/><g font-family="Arial,Microsoft YaHei,sans-serif"><text x="24" y="48" font-size="30" font-weight="bold" fill="#9d3d0a">${escape(title)}</text><text x="24" y="84" font-size="18">${escape(subtitle)}</text><text x="24" y="116" font-size="17">${escape(footer)}</text>${rows}</g></svg>`);
}
