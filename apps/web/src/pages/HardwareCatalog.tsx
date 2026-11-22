import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { EmptyState } from "../components/AsyncState";
import WorkbookSource from "../components/WorkbookSource";
import SpecComparison from "../components/SpecComparison";
import CatalogCompareTray from "../components/CatalogCompareTray";
import { useCompareSelection } from "../hooks/useCompareSelection";
import { ladderCpus, ladderGpus, ladderData, formatLadderValue, ladderGpuPlatformLabel, type LadderCpu, type LadderGpu } from "../data/ladder";

type Chip = LadderCpu | LadderGpu;
const value = (n: number | null, unit = "") => n == null ? "未提供" : `${formatLadderValue(n)}${unit}`;
function fields(chip: Chip): [string, string][] {
  const common: [string, string][] = [["厂商", chip.brand], ["标称功耗", chip.power_text ? `${chip.power_text} W` : "未提供"]];
  return chip.type === "cpu" ? [...common,
    ["核心", chip.cores_text || "未提供"], ["线程", value(chip.threads)],
    ["基础 / 加速频率", `${value(chip.base_clock)} / ${value(chip.boost_clock)} GHz`],
    ["CPU-Z 单核", value(chip.cpuz_single)], ["CPU-Z 多核", value(chip.cpuz_multi)],
    ["CPU-Z 综合", value(chip.cpuz_composite)], ["CPU Mark（独立参考）", value(chip.cpu_mark)],
    ["表内复核说明", chip.audit_note || "未提供"], ["参考档位（非名次）", chip.reference_tier || "未提供"],
  ] : [...common, ["平台", ladderGpuPlatformLabel(chip.platform)], ["架构", chip.arch || "未提供"],
    ["显存", chip.vram_gb != null ? `${chip.vram_gb} GB ${chip.vram_type || ""}` : chip.vram_text || "未提供"],
    ["显存带宽", value(chip.memory_bandwidth_gbs, " GB/s")], ["显存速度", value(chip.memory_speed_gbps, " Gbps")],
    ["加速频率", value(chip.boost_mhz, " MHz")], ["制程", value(chip.process_nm, " nm")],
    ["Time Spy 参考成绩", value(chip.tdmark_ts)], ["理论性能分（独立口径）", value(chip.theory_score)],
    ["发布年份（表内）", chip.year == null ? "未提供" : String(chip.year)],
  ];
}

export default function HardwareCatalog() {
  const [params, setParams] = useSearchParams();
  const type = params.get("type") === "gpu" ? "gpu" : "cpu";
  const query = params.get("q") || "", brand = params.get("brand") || "", platform = params.get("platform") || "";
  const scored = params.get("scored") === "1";
  const [limit, setLimit] = useState(30), [comparing, setComparing] = useState(false);
  const selection = useCompareSelection<Chip>(c => c.type);
  const pool: Chip[] = type === "cpu" ? ladderCpus : ladderGpus;
  const brands = [...new Set(pool.map(c => c.brand))].sort();
  const platforms = [...new Set(pool.map(c => c.platform))];
  const items = useMemo(() => pool.filter(c => (!brand || c.brand === brand) && (!platform || c.platform === platform)
    && (!scored || c.has_benchmark) && `${c.name} ${c.brand} ${c.type === "gpu" ? c.arch || "" : ""}`.toLowerCase().includes(query.trim().toLowerCase())),
    [pool, brand, platform, scored, query]);
  function update(values: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([k, v]) => v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true }); setLimit(30);
  }
  const source = ladderData.sources[type];
  const comparisonRows = selection.selected.length ? fields(selection.selected[0]).map(([label], index) => ({
    label, values: selection.selected.map(c => fields(c)[index][1]),
  })) : [];
  return <div>
    <PageHeader eyebrow="HARDWARE / 全量规格库" title="从一款型号，查清一组参数。"
      description="收录工作簿中的全部 CPU 与显卡，保留没有跑分的历史型号。CPU-Z、CPU Mark、Time Spy 与理论分分别展示。"
      actions={<><Link className="btn" to="/hardware/motherboards">主板与芯片组 →</Link><Link className="btn" to="/hardware/ladder">只看成绩排名 →</Link></>} />
    <div className="catalog-summary"><span><strong>{ladderCpus.length}</strong> 款 CPU</span><span><strong>{ladderGpus.length}</strong> 款显卡</span>
      <span>来源快照 <strong>{source.source_date}</strong></span><span>导入 <strong>{ladderData.checked_at}</strong></span></div>
    <aside className="notice subtle catalog-note"><p>{source.file} · 用户提供，未逐条在线核验。来源未提供的参数显示“未提供”。标称功耗不等于实际耗电。</p></aside>
    <section className="card filter-panel">
      <div className="filter-row"><div className="segmented" role="group" aria-label="规格类型">
        {(["cpu", "gpu"] as const).map(kind => <button key={kind} aria-pressed={type === kind}
          onClick={() => update({ type: kind, brand: null, platform: null, q: null })}>{kind.toUpperCase()}</button>)}
      </div><div className="search-field"><input aria-label="搜索全量型号" placeholder="搜索型号、品牌或架构" value={query} onChange={e => update({ q: e.target.value })} /></div>
        <select aria-label="规格品牌筛选" value={brand} onChange={e => update({ brand: e.target.value })}><option value="">全部品牌</option>{brands.map(b => <option key={b}>{b}</option>)}</select>
        <select aria-label="规格平台筛选" value={platform} onChange={e => update({ platform: e.target.value })}><option value="">全部平台</option>{platforms.map(p => <option key={p} value={p}>{p === "desktop" ? "桌面" : p === "mobile" ? "移动" : ladderGpuPlatformLabel(p)}</option>)}</select>
        <label className="catalog-checkbox"><input type="checkbox" checked={scored} onChange={e => update({ scored: e.target.checked ? "1" : null })} />仅看有参考跑分</label>
        <button className="text-button" onClick={() => update({ q: null, brand: null, platform: null, scored: null })}>重置筛选</button>
      </div>
    </section>
    <p className="muted small" role="status">找到 {items.length} 款 · 已展示 {Math.min(limit, items.length)} 款 · 最多对比 4 款同类硬件</p>
    {selection.error && <p className="error-box" role="alert">{selection.error}</p>}
    <div className="hardware-grid">{items.slice(0, limit).map(chip => {
      const active = selection.selected.some(s => s.id === chip.id);
      const spec = fields(chip);
      return <article className={`card hardware-card ${active ? "is-selected" : ""}`} key={chip.id}>
        <div className="chip-card-header"><div><h2 className="catalog-model">{chip.name}</h2><p className="muted small">{chip.brand} · {chip.type === "cpu" ? (chip.platform === "mobile" ? "移动 CPU" : "桌面 CPU") : ladderGpuPlatformLabel(chip.platform)}</p></div>
          <span className="badge badge-neutral">{chip.has_benchmark ? "有参考成绩" : "仅规格索引"}</span></div>
        <dl className="catalog-specs">{spec.slice(1, 5).map(([label, v]) => <div key={label}><dt>{label}</dt><dd>{v}</dd></div>)}</dl>
        <details className="catalog-details"><summary>全部参数与出处</summary><dl className="catalog-specs">{spec.slice(5).map(([label, v]) => <div key={label}><dt>{label}</dt><dd>{v}</dd></div>)}</dl>
          {chip.type === "cpu" && chip.spec_source_url && <a className="text-button" href={chip.spec_source_url} target="_blank" rel="noreferrer">表内规格来源 ↗</a>}
          {chip.benchmark_source?.url && <p><a className="text-button" href={chip.benchmark_source.url} target="_blank" rel="noreferrer">表内成绩来源 ↗</a></p>}
          {chip.type === "gpu" && chip.note && <p className="muted small">{chip.note}</p>}
          <WorkbookSource source={chip.source_ref} /></details>
        <button className={`btn ${active ? "btn-primary" : ""}`} aria-pressed={active} aria-label={`${active ? "取消选择" : "加入对比"} ${chip.name}`} onClick={() => selection.toggle(chip)}>{active ? "已加入 ✓" : "加入对比 +"}</button>
      </article>;
    })}</div>
    {!items.length && <section className="card"><EmptyState title="未找到匹配型号" description="试试放宽品牌、平台或跑分筛选。" /></section>}
    {items.length > limit && <div className="center-actions"><button className="btn" onClick={() => setLimit(n => n + 30)}>继续显示 · 还有 {items.length - limit} 款</button></div>}
    <CatalogCompareTray selected={selection.selected} toggle={selection.toggle} clear={selection.clear} compare={() => setComparing(true)} />
    {comparing && <SpecComparison names={selection.selected.map(c => c.name)} rows={comparisonRows} onClose={() => setComparing(false)} />}
  </div>;
}
