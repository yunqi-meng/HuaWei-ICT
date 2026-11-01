import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Brush, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { atPower, comparisonCSV, pointsCSV, desktopSets, displayNumber, loadSocpkSets, type BenchmarkSet, type Component, type PerformanceRow, type Platform } from "../data/benchmarkSets";
import { buildCurveData } from "../data/performance";
import PageHeader from "../components/PageHeader";
import TierImageViewer from "../components/TierImageViewer";
import { tierImage } from "../data/perfTiers";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncState";
import Icon from "../components/Icon";

const COLORS=["#c64a0b","#3979a9","#7553b5","#b45c8c","#69822b","#26786e"];
const DESKTOP=desktopSets();
export default function PerformanceCompare() {
  const [params,setParams]=useSearchParams();
  const location=useLocation();
  const candidate=params.get('platform') || location.pathname.split('/')[2];
  const platform: Platform=candidate==='desktop'||candidate==='mobile'?candidate:'phone';
  const component: Component=params.get('component')==='gpu'?'gpu':'cpu';
  const mode=params.get('mode')==='curve'?'curve':'tier';
  const [socpk,setSocpk]=useState<BenchmarkSet[]|null>(null);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const [query,setQuery]=useState('');
  const [brand,setBrand]=useState('');
  const [limit,setLimit]=useState(30);
  const efficiency=params.get('view')==='per-watt';
  const requestedPower=Number(params.get('power'));
  const budget=Number.isFinite(requestedPower)&&requestedPower>0?requestedPower:platform==='mobile'?80:5;
  const [chartReset,setChartReset]=useState(0);
  const [actionMessage,setActionMessage]=useState('');
  const chartRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(platform==='desktop')return;
    let active=true;setError('');
    loadSocpkSets().then(data=>{if(active)setSocpk(data);}).catch(()=>{if(active)setError('SOC PK 数据快照加载失败，请重试。');});
    return ()=>{active=false;};
  },[platform,retry]);
  const available=useMemo(()=>[...DESKTOP,...(socpk || [])].filter(d=>d.platform===platform&&d.component===component&&d.mode===mode),[socpk,platform,component,mode]);
  const requested=available.find(d=>d.id===params.get('dataset'));
  const dataset=requested || available.find(d=>d.id==='cpu-gb6') || available[0];
  const rows=dataset?.rows || [];
  const brands=[...new Set(rows.map(r=>r.brand))].sort();
  const filtered=rows.filter(r=>(!brand||r.brand===brand) && `${r.name} ${r.searchName || ''} ${r.brand}`.toLowerCase().includes(query.trim().toLowerCase()));
  const tokens=[...new Set((params.get('chips') || '').split(',').filter(Boolean))];
  const restored=tokens.map(t=>rows.find(r=>r.id===t||r.name===t)).filter((r):r is PerformanceRow=>!!r);
  const recommended=rows.filter(r=>r.recommended);
  const selected= params.has('chips') ? [...new Map(restored.map(r=>[r.id,r])).values()].slice(0,6)
    : mode==='curve' ? (recommended.length?recommended:rows).slice(0,3) : [];
  const baseline=rows.find(r=>r.id===params.get('baseline')) || selected[0] || rows[0];
  const curveData=useMemo(()=>buildCurveData(selected.map(r=>({name:r.name,brand:r.brand,score:r.score,eff:r.points})),efficiency),[dataset,selected.map(r=>r.id).join('|'),efficiency]);
  const maxPower=Math.max(1,...selected.flatMap(r=>r.points.map(p=>p.power)));
  const image=useMemo(()=>dataset && mode==='tier' && rows.length? tierImage([{label:dataset.metric,ratio:'当前收录最高分 = 1000',items:rows.map(r=>({name:r.name,brand:r.brand,score:Math.round(r.score/rows[0].score*1000),benchmark:r.score}))}],`${dataset.label} 天梯图`,{subtitle:`${dataset.source} · ${dataset.metric} · ${dataset.checkedAt} 核对快照`,footer:dataset.legacy?'来源历史项目 / 曲线端点排序，详见页面说明':'仅已收录型号；不同测试项目不能混排',precision:dataset.unit==='fps'?2:1}):undefined,[dataset,mode]);
  const update=(values: Record<string,string|null>,resetContext=false)=>{
    const next=new URLSearchParams(params);
    Object.entries(values).forEach(([k,v])=>v===null?next.delete(k):next.set(k,v));
    setParams(next,{replace:true});setActionMessage('');
    if(resetContext){setQuery('');setBrand('');setLimit(30);setChartReset(n=>n+1);}
  };
  const change=(values: Record<string,string|null>)=>update({...values,chips:null,baseline:null,dataset:values.dataset ?? null,view:null,power:values.power ?? null},true);
  const setBudget=(power:number)=>update({power:String(power)});
  const setEfficiency=(enabled:boolean)=>update({view:enabled?'per-watt':null});
  const toggle=(row: PerformanceRow)=>{
    const ids=selected.map(r=>r.id);
    if(!ids.includes(row.id)&&ids.length>=6){setActionMessage('最多选择 6 款，请先取消一个型号。');return;}
    update({chips:(ids.includes(row.id)?ids.filter(id=>id!==row.id):[...ids,row.id]).join(',')});
  };
  const exportData=(sourcePoints=false)=>{
    if(!dataset)return;
    const content=sourcePoints?pointsCSV(dataset,selected.length?selected:filtered):comparisonCSV(dataset,selected.length?selected:filtered,budget);
    const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');a.href=url;a.download=`zhixiu-${dataset.id}${sourcePoints?'-points':''}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setActionMessage('已导出 CSV，包含指标、来源与核对日期。');
  };
  const copyLink=async()=>{try{await navigator.clipboard.writeText(window.location.href);setActionMessage('对比链接已复制。');}catch{setActionMessage('无法访问剪贴板，可直接复制浏览器地址栏中的对比链接。');}};
  const fullscreen=async()=>{try{if(!chartRef.current?.requestFullscreen)throw Error();await chartRef.current.requestFullscreen();}catch{setActionMessage('当前浏览器不支持全屏，请使用图表下方缩放条。');}};
  return <div className="performance-page">
    <PageHeader eyebrow="PERFORMANCE LAB / 性能对比" title="性能看得明白，功耗比得具体。" description="参考 SOC PK 的分类与公开数据，分开比较单核、多核、GPU 及不同测试版本。" actions={<Link className="btn" to="/hardware">硬件规格库 <Icon name="arrow" size={17}/></Link>}/>
    <section className="card filter-panel">
      <div className="filter-row"><span className="filter-label">设备平台</span><div className="segmented" role="group" aria-label="设备平台">{([['phone','手机 / 平板'],['mobile','笔记本'],['desktop','桌面端']] as const).map(([id,label])=><button key={id} aria-pressed={platform===id} onClick={()=>{change({platform:id});}}>{label}</button>)}</div>
        <div className="segmented" role="group" aria-label="芯片类型">{(['cpu','gpu'] as const).map(id=><button key={id} aria-pressed={component===id} onClick={()=>change({component:id})}>{id.toUpperCase()}</button>)}</div></div>
      <div className="filter-row"><span className="filter-label">查看方式</span><div className="segmented" role="group" aria-label="查看方式"><button aria-pressed={mode==='tier'} onClick={()=>change({mode:'tier'})}><Icon name="grid" size={17}/> 性能天梯图</button><button aria-pressed={mode==='curve'} onClick={()=>change({mode:'curve'})}><Icon name="chart" size={17}/> 能耗曲线</button></div></div>
      {available.length>0 && <div className="perf-metric-row"><label htmlFor="perf-benchmark">测试项目</label><select id="perf-benchmark" value={dataset?.id || ''} onChange={e=>change({dataset:e.target.value})}>{available.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></div>}
    </section>
    {platform!=='desktop'&&!socpk&&!error ? <LoadingState label="正在加载 SOC PK 数据快照…"/> : error && platform!=='desktop' ? <ErrorState message={error} retry={()=>setRetry(n=>n+1)}/> : !dataset ? <section className="card"><EmptyState title={mode==='curve'?'该分类暂无能耗曲线':'该分类暂无可核验的排名数据'} description="SOC PK 当前提供移动 SoC 与笔记本显卡资料；桌面部分保留有来源的 Geekbench 成绩。未使用标称 TDP 推算曲线。"/><div className="center-actions"><button className="btn btn-primary" onClick={()=>change({platform:'phone',component:'cpu',mode:'curve'})}>查看手机 CPU 曲线 →</button><button className="btn" onClick={()=>{change({platform:'mobile',component:'gpu',mode:'curve'});}}>查看笔记本显卡 →</button></div></section> : <>
      <section className="perf-overview" aria-label="当前数据概况"><div><span>收录型号 / 核心曲线</span><strong>{rows.length}</strong></div><div><span>当前测试</span><strong>{dataset.metric}</strong></div><div><span>数据核对</span><strong>{dataset.checkedAt}{dataset.legacy?' · 历史项目':''}</strong></div></section>
      <aside className="notice perf-source"><div><strong>{dataset.source}</strong><p>{dataset.note}</p>{mode==='curve'&&<p>{dataset.powerLabel}。只在来源数据范围内连线与线性估算，不向零瓦或更高功耗外推；带拟合标记的来源点不当作原始逐点测量。</p>}</div><a className="btn" href={dataset.sourceUrl} target="_blank" rel="noreferrer">核对原始资料 ↗</a></aside>
      <section className="card">
        <div className="section-heading"><div><h2>{mode==='curve'?'选择对比型号':'性能数据天梯'} <span className="count-badge">{selected.length} / 6</span></h2><p className="muted">{mode==='curve'?'最多同时展示 6 条曲线，可按品牌与型号查找。':'显示来源分数；条形长度以当前项目最高分为 100%，不跨测试排名。'}</p></div><div className="perf-actions"><button className="btn" onClick={()=>exportData()}>导出 CSV</button>{mode==="curve"&&<button className="btn" onClick={()=>exportData(true)}>导出来源点</button>}<button className="btn" onClick={copyLink}>复制对比链接</button></div></div>
        <div className="hardware-filters"><div className="search-field"><Icon name="search" size={17}/><input aria-label={mode==='curve'?'搜索能耗芯片':'搜索天梯芯片'} value={query} placeholder="搜索型号、核心或品牌" onChange={e=>{setQuery(e.target.value);setLimit(30);}}/></div><select aria-label="品牌筛选" value={brand} onChange={e=>{setBrand(e.target.value);setLimit(30);}}><option value="">全部品牌</option>{brands.map(b=><option key={b}>{b}</option>)}</select><button className="btn" onClick={()=>update({chips:filtered.slice(0,3).map(r=>r.id).join(',')})}>对比前三款</button><button className="text-button" onClick={()=>update({chips:''})}>清空选择</button></div>
        {actionMessage&&<p className="notice subtle" role="status">{actionMessage}</p>}
        {mode==='curve'? <div className="chip-options perf-chip-options">{filtered.map(row=>{const index=selected.findIndex(r=>r.id===row.id),active=index>=0;return <button key={row.id} className={`chip-option ${active?'selected':''}`} style={active?{borderColor:COLORS[index],color:COLORS[index]}:undefined} aria-pressed={active} disabled={!active&&selected.length>=6} onClick={()=>toggle(row)}>{active&&<Icon name="check" size={16}/>}<span>{row.name}</span></button>;})}</div> : <div className="perf-ranking" role="list" aria-label={dataset.metric+' 排名'}>{filtered.slice(0,limit).map(row=>{
          const index=selected.findIndex(r=>r.id===row.id),rank=rows.findIndex(r=>r.id===row.id)+1;
          return <article role="listitem" key={row.id} className={`perf-rank-row ${index>=0?'is-selected':''}`}><span className="perf-rank-number">{rank}</span><div className="perf-rank-content"><div className="perf-rank-title"><strong>{row.name}</strong><span>{row.brand}</span></div><div className="score-track"><span style={{width:`${row.score/rows[0].score*100}%`,background:'#d9661a'}}/></div></div><strong className="perf-score">{displayNumber(row.score)} <small>{dataset.unit}</small></strong><button className={`btn ${index>=0?'btn-primary':''}`} aria-pressed={index>=0} disabled={index<0&&selected.length>=6} aria-label={`${index>=0?'移除':'加入对比'} ${row.name}`} onClick={()=>toggle(row)}>{index>=0?'已选 ✓':'加入对比 +'}</button></article>;
        })}</div>}
        {!filtered.length&&<EmptyState title="未找到匹配型号" description="更换关键词或品牌筛选；已选择的型号会保留。"/>}
        {mode==='tier'&&filtered.length>limit&&<div className="center-actions"><button className="btn" onClick={()=>setLimit(n=>n+30)}>继续显示 · 还有 {filtered.length-limit} 款</button></div>}
        {selected.length>0&&<div className="perf-selected" aria-label="已选型号">{selected.map((r,i)=><button className="chip-option selected" key={r.id} style={{color:COLORS[i]}} aria-label={`移除 ${r.name}`} onClick={()=>toggle(r)}>{r.name} ×</button>)}</div>}
      </section>
      {mode==='tier'&&selected.length>0&&<section className="card"><div className="section-heading"><h2>所选型号对比</h2><label>基准型号 <select aria-label="对比基准型号" value={baseline?.id} onChange={e=>update({baseline:e.target.value})}>{(selected.some(r=>r.id===baseline?.id)?selected:[baseline,...selected]).filter((r):r is PerformanceRow=>!!r).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div><div className="table-scroll"><table><thead><tr><th>型号</th><th>{dataset.metric}</th><th>相对基准</th><th>操作</th></tr></thead><tbody>{selected.map(r=><tr key={r.id}><td>{r.name}</td><td>{displayNumber(r.score)} {dataset.unit}</td><td>{displayNumber(r.score/baseline.score*100,1)}%</td><td><button className="text-button" onClick={()=>toggle(r)}>移除</button></td></tr>)}</tbody></table></div></section>}
      {mode==='curve' && (selected.length ? <>
        <section className="card perf-chart-card" ref={chartRef}><div className="section-heading"><div><h2>{efficiency?'每瓦性能':'性能与功耗'}</h2><p className="muted">{dataset.metric} · {dataset.powerLabel}</p></div><div className="perf-actions"><div className="segmented" role="group" aria-label="曲线指标"><button aria-pressed={!efficiency} onClick={()=>setEfficiency(false)}>性能</button><button aria-pressed={efficiency} onClick={()=>setEfficiency(true)}>性能 / 瓦</button></div><button className="btn" onClick={()=>setChartReset(n=>n+1)}>重置缩放</button><button className="btn" onClick={fullscreen}>全屏查看</button></div></div>
          <div className="chart-frame" role="img" aria-label={`${selected.map(r=>r.name).join('、')}的${efficiency?'每瓦性能':'性能功耗'}曲线，数据见下表`}><ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart key={`${dataset.id}:${selected.map(r=>r.id).join('|')}:${chartReset}`} data={curveData} margin={{top:15,right:24,bottom:30,left:4}}><CartesianGrid strokeDasharray="4 4" stroke="#efdfd0"/><XAxis type="number" dataKey="power" domain={['dataMin','dataMax']} tick={{fontSize:14}} tickFormatter={v=>`${displayNumber(Number(v))} W`}/><YAxis width={74} tick={{fontSize:14}} tickFormatter={v=>displayNumber(Number(v),1)}/><Tooltip labelFormatter={v=>`功耗 ${displayNumber(Number(v))} W`} formatter={(v,name)=>[`${displayNumber(Number(v))} ${dataset.unit}${efficiency?'/W':''}`,name]}/><Legend verticalAlign="top" wrapperStyle={{fontSize:15,paddingBottom:20}}/>{selected.map((r,i)=><Line key={r.id} name={r.name} dataKey={`chip${i}`} type="linear" stroke={COLORS[i]} strokeWidth={2.5} dot={false} activeDot={{r:5}} connectNulls={false} isAnimationActive={false}/>)}<Brush dataKey="power" height={26} stroke="#c64a0b" tickFormatter={v=>`${displayNumber(Number(v))}W`}/></LineChart></ResponsiveContainer></div><p className="muted small">横轴：功耗（W）；纵轴：{dataset.unit}{efficiency?'/W':''}。</p><p className="muted small">拖动图表下方两端滑块缩放功耗范围；悬停查看数值。点间连线是线性估算，不代表新增实测点。</p>
        </section>
        <section className="card"><div className="section-heading"><div><h2>同功耗比较</h2><p className="muted">超出某型号的来源功耗范围时留空；“—”不表示零分。</p></div><label className="perf-budget">功耗 <input aria-label="对比功耗 W" type="number" min="0.01" step="0.1" value={budget} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>0)setBudget(n);}}/> W</label></div><input className="perf-power-slider" aria-label="拖动调整对比功耗" type="range" min="0.1" step="0.1" max={Math.ceil(maxPower)} value={Math.min(budget,Math.ceil(maxPower))} onChange={e=>setBudget(Number(e.target.value))}/><div className="table-scroll"><table><thead><tr><th>型号 / 核心</th><th>来源功耗范围</th><th>{budget} W 估算成绩</th><th>{dataset.unit} / W</th><th>最高来源点成绩</th><th>来源标记</th></tr></thead><tbody>{selected.map(r=>{const score=atPower(r,budget);return <tr key={r.id}><td>{r.name}</td><td>{displayNumber(r.points[0].power)}–{displayNumber(r.points.at(-1)!.power)} W</td><td>{displayNumber(score)} {score!=null?dataset.unit:''}</td><td>{displayNumber(score==null?null:score/budget)}</td><td>{displayNumber(r.score)} {dataset.unit}</td><td>{r.fitted?'含拟合标记':'来源提供点'}</td></tr>;})}</tbody></table></div><details className="perf-source-points"><summary>查看来源提供的功耗点</summary>{selected.map(r=><div key={r.id}><h3>{r.name}</h3><p className="muted">{r.points.length} 个来源点{r.fitted?'，来源带拟合标记':''}。</p><div className="perf-point-list">{r.points.map(p=><span key={p.power}>{displayNumber(p.power,4)} W · {displayNumber(p.score,4)} {dataset.unit}</span>)}</div></div>)}</details></section>
      </> : <section className="card"><EmptyState title="从一个型号开始探索" description="选择上方型号，或点击“对比前三款”查看曲线。"/></section>)}
      {image&&<details className="card perf-image-details"><summary>展开可缩放的天梯全图</summary><TierImageViewer key={image} src={image} title={`${dataset.label} 天梯图`}/></details>}
      <p className="muted small">数据为核对时的来源快照，来源未提供明确更新日期时不视为实时数据。历史项目与不同版本成绩分开展示；原始资料归来源作者所有。</p>
    </>}
    <div className="page-links"><Link to="/hardware"><Icon name="chip" size={17}/> 查询硬件规格与来源 →</Link><a href="https://www.socpk.com/" target="_blank" rel="noreferrer">访问 SOC PK 原站 ↗</a></div>
  </div>;
}
