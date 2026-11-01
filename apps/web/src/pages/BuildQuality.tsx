import { useId, useState } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";
import { EmptyState } from "../components/AsyncState";
import catalog from "../data/buildQuality.json";
import images from "../data/productImages.json";
type QualityItem = (typeof catalog)[number];

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
  const category = platform === "mobile" ? "laptop" : params.get("category") === "gpu" ? "gpu" : "mb";
  const [query,setQuery] = useState("");
  const [sort,setSort] = useState("verified");
  const items = catalog.filter(c => c.category === category && `${c.name} ${c.brand}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b) => sort === "name" ? a.name.localeCompare(b.name) : Number(b.facts.length > 0) - Number(a.facts.length > 0));
  const update = (values: Record<string,string>) => { const next = new URLSearchParams(params);Object.entries(values).forEach(([k,v])=>next.set(k,v));setParams(next,{replace:true});setQuery(""); };
  return <div>
    <PageHeader eyebrow="BUILD & DETAILS / 做工资料" title="看得见的细节，查得到的依据。" description="按完整型号核对厂商公开资料，了解结构、供电和散热设计。" />
    <section className="card filter-panel"><div className="filter-row"><span className="filter-label">设备平台</span>
      <div className="segmented" role="group" aria-label="做工设备平台">{([["desktop","桌面端"],["mobile","笔记本"]] as const).map(([key,label])=><button key={key} aria-pressed={platform===key} onClick={()=>update({platform:key,category:key==="desktop"?"mb":"laptop"})}>{label}</button>)}</div>
      {platform==="desktop" && <div className="segmented" role="group" aria-label="做工硬件类型">{([["mb","主板"],["gpu","显卡"]] as const).map(([key,label])=><button key={key} aria-pressed={category===key} onClick={()=>update({category:key})}>{label}</button>)}</div>}
    </div></section>
    <div className="notice quality-summary"><Icon name="info" size={18} /><span>已撤下无依据的评分、价格和质保承诺。官方图片按型号核对；缺少可靠图片时显示类别图标。待核验条目不参与优劣比较。</span></div>
    <div className="section-heading"><div><h2>{category==="mb"?"主板":category==="gpu"?"显卡":"笔记本"}资料</h2><p className="muted">{items.length} 款 · 展开查看核对内容与来源</p></div><div className="hardware-filters">
      <div className="search-field"><Icon name="search" size={17} /><input aria-label="搜索做工型号" placeholder="搜索完整型号或品牌" value={query} onChange={e=>setQuery(e.target.value)} /></div>
      <select aria-label="做工排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="verified">已核对规格优先</option><option value="name">按名称排序</option></select>
    </div></div>
    {items.map(item=><QualityCard key={item.id} item={item} />)}
    {!items.length && <section className="card"><EmptyState title="未找到匹配硬件" description="试试其他型号或品牌关键词。" /></section>}
  </div>;
}
