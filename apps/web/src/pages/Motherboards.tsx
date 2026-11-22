import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";
import { EmptyState } from "../components/AsyncState";
import WorkbookSource from "../components/WorkbookSource";
import SpecComparison from "../components/SpecComparison";
import CatalogCompareTray from "../components/CatalogCompareTray";
import { useCompareSelection } from "../hooks/useCompareSelection";
import { motherboards, chipsets, chipsetById, motherboardData, historicalPrice, type Motherboard, type Chipset } from "../data/motherboards";

const shown = (v: string | null | undefined) => v || "未提供";
function boardFields(b: Motherboard): [string, string][] {
  return [["品牌", b.brand], ["芯片组", b.chipset], ["插槽（芯片组参考）", b.socket],
    ["板型", shown(b.form_factor)], ["供电模式", shown(b.vrm)], ["内存", shown(b.memory)],
    ["外形尺寸", shown(b.dimensions)], ["电源接口", shown(b.power_connectors)], ["音频芯片", shown(b.audio)],
    ["表内历史参考价 / 备注", historicalPrice(b)], ["资料备注", shown(b.note)],
    ["来源位置", `${b.source_ref.sheet} · 第 ${b.source_ref.row} 行`]];
}
function chipsetFields(c: Chipset): [string, string][] {
  return [["平台 / 插槽", c.socket], ["发布时期（表内）", shown(c.release_text)], ["定位", shown(c.positioning)],
    ["芯片组自身功耗", shown(c.chipset_power)], ["典型主板供电（参考）", shown(c.typical_vrm)],
    ["内存支持（平台）", shown(c.memory_support)], ["CPU 直连 PCIe", shown(c.cpu_pcie)],
    ["芯片组 PCIe 扩展", shown(c.chipset_pcie)], ["SATA（最多）", shown(c.sata)],
    ["USB（最多）", shown(c.usb)], ["超频（CPU / 内存）", shown(c.overclock)]];
}
function BoardPhoto({ board }: { board: Motherboard }) {
  const [failed, setFailed] = useState(false);
  return <figure className="motherboard-photo">
    {board.image && !failed ? <img src={board.image} alt={`${board.name} 表内产品缩略图`} loading="lazy" onError={() => setFailed(true)} /> : <Icon name="chip" size={42} />}
    <figcaption>{board.image && !failed ? "表内缩略图 · ZOL" : "暂无表内图片"}</figcaption>
  </figure>;
}
function BoardCard({ board, active, toggle }: { board: Motherboard; active: boolean; toggle: () => void }) {
  const chipset = chipsetById.get(board.chipset_id)!;
  return <article className={`card hardware-card motherboard-card ${active ? "is-selected" : ""}`}>
    <div className="motherboard-heading"><BoardPhoto board={board} /><div><span className="eyebrow">{board.vendor} · {board.chipset} · {board.brand}</span>
      <h2 className="catalog-model">{board.name}</h2><span className="badge badge-neutral">{board.has_specs ? "表内有规格" : "参数待补"}</span></div></div>
    <dl className="catalog-specs">{boardFields(board).slice(2, 6).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <details className="catalog-details"><summary>板卡参数与芯片组能力</summary>
      <dl className="catalog-specs">{boardFields(board).slice(6, 10).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="muted small">{board.note}</p><h3>芯片组能力参考</h3>
      <p className="muted small">接口上限由芯片组定义，实际接口、内存与 CPU 支持还需核对该主板型号及 BIOS 支持列表。</p>
      <dl className="catalog-specs">{chipsetFields(chipset).slice(3).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <WorkbookSource source={board.source_ref} />
    </details>
    <button className={`btn ${active ? "btn-primary" : ""}`} aria-pressed={active} aria-label={`${active ? "取消选择" : "加入对比"} ${board.name}`} onClick={toggle}>{active ? "已加入 ✓" : "加入对比 +"}</button>
  </article>;
}

export default function Motherboards() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "chipsets" ? "chipsets" : "boards";
  const query = params.get("q") || "", vendor = params.get("vendor") || "", socket = params.get("socket") || "";
  const chipset = params.get("chipset") || "", brand = params.get("brand") || "", memory = params.get("memory") || "", form = params.get("form") || "";
  const specsOnly = params.get("specs") === "1", includePreview = params.get("preview") === "1";
  const [limit, setLimit] = useState(24), [comparing, setComparing] = useState(false);
  const selection = useCompareSelection<Motherboard>();
  function update(values: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([k, v]) => v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true }); setLimit(24);
  }
  const availableChipsets = chipsets.filter(c => (!vendor || c.vendor === vendor) && (!socket || c.socket === socket));
  const boardItems = useMemo(() => motherboards.filter(b => (!vendor || b.vendor === vendor) && (!socket || b.socket === socket)
    && (!chipset || b.chipset === chipset) && (!brand || b.brand === brand) && (!memory || b.memory_types.includes(memory))
    && (!form || b.form_factor === form) && (!specsOnly || b.has_specs)
    && `${b.name} ${b.brand} ${b.chipset} ${b.socket} ${b.memory || ""}`.toLowerCase().includes(query.trim().toLowerCase())),
    [vendor, socket, chipset, brand, memory, form, specsOnly, query]);
  const chipsetItems = availableChipsets.filter(c => (includePreview || !c.is_preview) && (!chipset || c.codes.includes(chipset))
    && `${c.vendor} ${c.name} ${c.socket} ${c.memory_support || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const brands = [...new Set(motherboards.map(b => b.brand))];
  const forms = [...new Set(motherboards.map(b => b.form_factor).filter((f): f is string => !!f))];
  const sockets = [...new Set((view === "boards" ? motherboards : chipsets.filter(c => includePreview || !c.is_preview))
    .filter(c => !vendor || c.vendor === vendor).map(c => c.socket))];
  const codes = [...new Set(motherboards.filter(b => (!vendor || b.vendor === vendor) && (!socket || b.socket === socket)).map(b => b.chipset))];
  const comparisonRows = selection.selected.length ? boardFields(selection.selected[0]).map(([label], i) => ({ label, values: selection.selected.map(b => boardFields(b)[i][1]) })) : [];
  return <div>
    <PageHeader eyebrow="MOTHERBOARDS / 平台与板卡" title="先看平台，再看每一块主板。"
      description="按芯片组、插槽、品牌和内存类型查询表内资料，区分芯片组自身功耗与板卡供电设计。"
      actions={<Link className="btn" to="/hardware/catalog">CPU / GPU 完整规格 →</Link>} />
    <div className="catalog-summary"><span><strong>{chipsets.length}</strong> 个芯片组</span><span><strong>{motherboards.length}</strong> 款代表主板</span>
      <span><strong>{motherboards.filter(b => b.image).length}</strong> 张表内图片</span><span>导入 <strong>{motherboardData.checked_at}</strong></span></div>
    <aside className="notice subtle catalog-note"><p>来源：用户提供的主板工作簿（2026 年 11 月）。产品参数与图片按表内 ZOL 转录资料展示，未逐条在线核验；价格为历史参考。预告芯片组单独标记，不代表已发布规格。</p></aside>
    <section className="card filter-panel"><div className="segmented" role="group" aria-label="主板资料视图">
      <button aria-pressed={view === "boards"} onClick={() => update({ view: null })}>品牌主板</button>
      <button aria-pressed={view === "chipsets"} onClick={() => update({ view: "chipsets", q: null, chipset: null })}>芯片组总表</button>
    </div><div className="hardware-filters">
      <div className="search-field"><input aria-label="搜索主板或芯片组" placeholder="型号、芯片组或插槽" value={query} onChange={e => update({ q: e.target.value })} /></div>
      <select aria-label="芯片组厂商" value={vendor} onChange={e => update({ vendor: e.target.value, socket: null, chipset: null })}><option value="">Intel / AMD</option><option>Intel</option><option>AMD</option></select>
      <select aria-label="主板插槽" value={socket} onChange={e => update({ socket: e.target.value, chipset: null })}><option value="">全部插槽</option>{sockets.map(s => <option key={s}>{s}</option>)}</select>
      {view === "boards" && <>
        <select aria-label="主板芯片组" value={chipset} onChange={e => update({ chipset: e.target.value })}><option value="">全部芯片组</option>{codes.map(c => <option key={c}>{c}</option>)}</select>
        <select aria-label="主板品牌" value={brand} onChange={e => update({ brand: e.target.value })}><option value="">全部品牌</option>{brands.map(b => <option key={b}>{b}</option>)}</select>
        <select aria-label="主板内存类型" value={memory} onChange={e => update({ memory: e.target.value })}><option value="">全部内存</option>{["DDR3", "DDR4", "DDR5"].map(m => <option key={m}>{m}</option>)}</select>
        <select aria-label="主板板型" value={form} onChange={e => update({ form: e.target.value })}><option value="">全部板型</option>{forms.map(f => <option key={f}>{f}</option>)}</select>
        <label className="catalog-checkbox"><input type="checkbox" checked={specsOnly} onChange={e => update({ specs: e.target.checked ? "1" : null })} />仅看有参数型号</label>
      </>}
      {view === "chipsets" && <label className="catalog-checkbox"><input type="checkbox" checked={includePreview} onChange={e => update({ preview: e.target.checked ? "1" : null })} />包含表内预告型号</label>}
      <button className="text-button" onClick={() => { setParams(view === "chipsets" ? { view: "chipsets" } : {}, { replace: true }); setLimit(24); }}>重置筛选</button>
    </div></section>
    <p className="muted small" role="status">找到 {view === "boards" ? `${boardItems.length} 款主板` : `${chipsetItems.length} 个芯片组`}{view === "boards" ? ` · 已展示 ${Math.min(limit, boardItems.length)} 款` : " · 预告型号默认隐藏"}</p>
    {selection.error && <p className="error-box" role="alert">{selection.error}</p>}
    {view === "boards" ? <>
      <div className="hardware-grid">{boardItems.slice(0, limit).map(board => <BoardCard key={board.id} board={board} active={selection.selected.some(s => s.id === board.id)} toggle={() => selection.toggle(board)} />)}</div>
      {!boardItems.length && <section className="card"><EmptyState title="没有匹配的主板" description="试试放宽插槽、内存或品牌筛选。" /></section>}
      {boardItems.length > limit && <div className="center-actions"><button className="btn" onClick={() => setLimit(n => n + 24)}>继续显示 · 还有 {boardItems.length - limit} 款</button></div>}
    </> : <>
      <p className="muted">芯片组能力是平台上限，不能据此推断具体板卡的接口数量、供电质量或 CPU 兼容性。</p>
      <div className="hardware-grid">{chipsetItems.map(c => <article key={c.id} className="card hardware-card">
        <div className="chip-card-header"><div><span className="eyebrow">{c.vendor} · {c.socket}</span><h2 className="catalog-model">{c.name}</h2></div>
          <span className={`badge ${c.is_preview ? "badge-warning" : "badge-neutral"}`}>{c.is_preview ? "预告 · 未确认" : shown(c.positioning)}</span></div>
        <dl className="catalog-specs">{chipsetFields(c).slice(1, 6).map(([label, v]) => <div key={label}><dt>{label}</dt><dd>{v}</dd></div>)}</dl>
        <details className="catalog-details"><summary>通道、接口与来源</summary><dl className="catalog-specs">{chipsetFields(c).slice(6).map(([label, v]) => <div key={label}><dt>{label}</dt><dd>{v}</dd></div>)}</dl><p className="muted small">{c.note}</p><WorkbookSource source={c.source_ref} /></details>
        {!c.is_preview && <button className="btn" onClick={() => update({ view: null, chipset: c.codes[0], brand: null, memory: null, form: null, q: null, specs: null })}>查看 {c.name} 主板</button>}
      </article>)}</div>
      {!chipsetItems.length && <section className="card"><EmptyState title="没有匹配的芯片组" description="放宽筛选，或查看表内预告型号。" /></section>}
    </>}
    <details className="card catalog-details"><summary>工作簿范围与来源说明</summary><p>{motherboardData.source.file} · 文件 SHA-256：<code>{motherboardData.source.sha256}</code></p>
      <p>导入保留原表说明；以下文字是来源记录，预告和历史时点不代表当前事实核验。</p>
      <dl className="catalog-specs">{motherboardData.source_notes.map((n, i) => <div key={i}><dt>{n.label}</dt><dd>{n.text}</dd></div>)}</dl></details>
    <CatalogCompareTray selected={selection.selected} toggle={selection.toggle} clear={selection.clear} compare={() => setComparing(true)} />
    {comparing && <SpecComparison names={selection.selected.map(b => b.name)} rows={comparisonRows} onClose={() => setComparing(false)} />}
  </div>;
}
