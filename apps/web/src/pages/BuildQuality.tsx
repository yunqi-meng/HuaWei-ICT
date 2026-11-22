import { useId, useState } from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";
import { EmptyState } from "../components/AsyncState";
import catalog from "../data/buildQuality.json";
import images from "../data/productImages.json";
import {
  ladderGpus, LADDER_CHECKED_AT, formatLadderValue, ladderGpuPlatformLabel,
  gpuPerfPerWatt, type LadderGpu,
} from "../data/ladder";
type QualityItem = (typeof catalog)[number];

/** 天梯表显卡的“规格与做工档位”卡片：用 TDP、制程、显存等可核对参数展示。 */
function LadderGpuCard({ gpu }: { gpu: LadderGpu }) {
  const perWatt = gpuPerfPerWatt(gpu);
  const facts: { label: string; value: string }[] = [
    { label: "架构", value: gpu.arch || "未标注" },
    { label: "制程", value: gpu.process_nm ? `${gpu.process_nm} nm` : "未标注" },
    { label: "标称功耗", value: gpu.tdp ? `${gpu.tdp} W` : "未标注" },
    { label: "显存", value: gpu.vram_gb ? `${gpu.vram_gb} GB ${gpu.vram_type || ""}`.trim() : "未标注" },
    { label: "显存带宽", value: gpu.memory_bandwidth_gbs != null ? `${gpu.memory_bandwidth_gbs} GB/s` : "未标注" },
    { label: "显存速度", value: gpu.memory_speed_gbps != null ? `${gpu.memory_speed_gbps} Gbps` : "未标注" },
    { label: "加速频率", value: gpu.boost_mhz ? `${gpu.boost_mhz} MHz` : "未标注" },
  ];
  return <article className="card quality-card">
    <div className="quality-card-header">
      <figure className="quality-image audited-product-image">
        <Icon name="chip" size={48} />
        <figcaption>类别图标，非产品实拍</figcaption>
      </figure>
      <div className="quality-card-info">
        <div className="quality-card-title">
          <div>
            <h3>{gpu.name}</h3>
            <p className="muted">
              {gpu.brand} · {ladderGpuPlatformLabel(gpu.platform)} · 天梯表导入于 {LADDER_CHECKED_AT}
            </p>
          </div>
          <span className="badge badge-neutral">{gpu.tier_label}</span>
        </div>
        <p>
          3DMark Time Spy：{formatLadderValue(gpu.tdmark_ts)}
          {gpu.tdmark_ts != null ? "（表内参考成绩）" : "（来源未提供）"}
          {perWatt != null ? ` · 每瓦约 ${Math.round(perWatt * 100) / 100} 分` : ""}
        </p>
        <dl className="audited-specs">
          {facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
        </dl>
      </div>
    </div>
    <p className="muted small">
      规格为公版口径参考；各 AIB 板卡的供电、散热与频率可能不同。功耗与显存不等于做工评分。
    </p>
  </article>;
}

function QualityCard({ item }: { item: QualityItem }) {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const detailsId = useId();
  const image = images.find(image => image.path === item.image);
  return <article className="card quality-card">
    <div className="quality-card-header">
      <figure className="quality-image audited-product-image">
        {item.image && !failed ? <img src={item.image} alt={`${item.name} 官方产品图`} loading="lazy" onError={() => setFailed(true)} />
          : <Icon name={item.category === "laptop" ? "laptop" : "chip"} size={48} />}
        <figcaption>{item.image && !failed ? "官方产品图" : "类别图标，非产品实拍"}</figcaption>
      </figure>
      <div className="quality-card-info">
        <div className="quality-card-title"><div><h3>{item.name}</h3><p className="muted">{item.brand} · 核对于 {item.checked_at}</p></div><span className="badge badge-neutral">{item.status}</span></div>
        {item.facts.length > 0 && <p>{item.facts[0].label}：{item.facts[0].value}</p>}
        {item.note && <p className="muted">{item.note}</p>}
        <div className="card-actions">
          <button className="btn" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(!expanded)}>{expanded ? "收起详细资料 −" : "查看详细资料 +"}</button>
          {item.source_url && <a className="btn btn-primary" href={item.source_url} target="_blank" rel="noreferrer">查看官方资料 ↗</a>}
        </div>
      </div>
    </div>
    {expanded && <div className="quality-details" id={detailsId}>
      {item.facts.length ? <dl className="audited-specs">{item.facts.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl> : <p>尚无可核验的完整型号或规格，不作做工优劣结论。</p>}
      <p className="muted">价格与售后随地区、渠道、时间和配置变化，本页不提供统一报价或保修承诺。供电数量不等于做工评分。</p>
      {image && <a className="text-button" href={image.source_url} target="_blank" rel="noreferrer">图片来源：{item.brand} 官方产品页素材 ↗</a>}
    </div>}
  </article>;
}
export default function BuildQuality() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const platform = (params.get("platform") || location.pathname.split("/")[2]) === "mobile" ? "mobile" : "desktop";
  const category = platform === "mobile" ? "laptop" : params.get("category") === "gpu" ? "gpu" : params.get("category") === "ladder-gpu" ? "ladder-gpu" : "mb";
  const [query,setQuery] = useState("");
  const [sort,setSort] = useState("verified");
  const isLadder = category === "ladder-gpu";
  const ladderItems = isLadder
    ? ladderGpus.filter(g => `${g.name} ${g.brand}`.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a,b) => sort === "name" ? a.name.localeCompare(b.name) : (b.tdp ?? 0) - (a.tdp ?? 0))
    : [];
  const items = isLadder ? [] : catalog.filter(c => c.category === category && `${c.name} ${c.brand}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b) => sort === "name" ? a.name.localeCompare(b.name) : Number(b.facts.length > 0) - Number(a.facts.length > 0));
  const update = (values: Record<string,string>) => { const next = new URLSearchParams(params);Object.entries(values).forEach(([k,v])=>next.set(k,v));setParams(next,{replace:true});setQuery(""); };
  return <div>
    <PageHeader eyebrow="BUILD & DETAILS / 做工资料" title="看得见的细节，查得到的依据。" description="按完整型号核对厂商公开资料，了解结构、供电和散热设计。" actions={<Link className="btn" to="/hardware/motherboards">浏览完整主板与芯片组资料 →</Link>} />
    <section className="card filter-panel"><div className="filter-row"><span className="filter-label">设备平台</span>
      <div className="segmented" role="group" aria-label="做工设备平台">{([["desktop","桌面端"],["mobile","笔记本"]] as const).map(([key,label])=><button key={key} aria-pressed={platform===key} onClick={()=>update({platform:key,category:key==="desktop"?"mb":"laptop"})}>{label}</button>)}</div>
      {platform==="desktop" && <div className="segmented" role="group" aria-label="做工硬件类型">{([["mb","主板"],["gpu","显卡"],["ladder-gpu","全世代显卡规格"]] as const).map(([key,label])=><button key={key} aria-pressed={category===key} onClick={()=>update({category:key})}>{label}</button>)}</div>}
    </div></section>
    <div className="notice quality-summary"><Icon name="info" size={18} /><span>已撤下无依据的评分、价格和质保承诺。官方图片按型号核对；缺少可靠图片时显示类别图标。待核验条目不参与优劣比较。</span></div>
    <div className="section-heading"><div><h2>{category==="mb"?"主板":category==="gpu"?"显卡":isLadder?"全世代显卡规格":"笔记本"}资料</h2><p className="muted">{isLadder?ladderItems.length:items.length} 款 · {isLadder?"天梯表公版规格":"展开查看核对内容与来源"}</p></div><div className="hardware-filters">
      <div className="search-field"><Icon name="search" size={17} /><input aria-label="搜索做工型号" placeholder="搜索完整型号或品牌" value={query} onChange={e=>setQuery(e.target.value)} /></div>
      <select aria-label="做工排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="verified">{isLadder ? "标称功耗从高到低" : "已核对规格优先"}</option><option value="name">按名称排序</option></select>
    </div></div>
    {isLadder && ladderItems.slice(0, 60).map(g => <LadderGpuCard key={g.id} gpu={g} />)}
    {isLadder && ladderItems.length > 60 && <p className="muted">此处预览前 60 款，共 {ladderItems.length} 款。<Link to="/hardware/catalog?type=gpu">浏览全部显卡规格与来源 →</Link></p>}
    {!isLadder && items.map(item=><QualityCard key={item.id} item={item} />)}
    {!items.length && !isLadder && <section className="card"><EmptyState title="未找到匹配硬件" description="试试其他型号或品牌关键词。" /></section>}
    {isLadder && !ladderItems.length && <section className="card"><EmptyState title="未找到匹配显卡" description="试试其他型号或品牌关键词。" /></section>}
  </div>;
}
