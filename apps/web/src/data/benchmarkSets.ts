import { chips, CHECKED_AT } from "./hardware";
import { normalizePoints, scoreAtPower } from "./performance";
import type { EffPoint } from "./perfTiers";
import { rankedLadderCpus as ladderCpus, scoredLadderGpus as ladderGpus, LADDER_CHECKED_AT } from "./ladder";

export type Platform = "desktop" | "mobile" | "phone";
type ViewMode = "tier" | "curve";
export type Component = "cpu" | "gpu";
export interface PerformanceRow {
  id: string; name: string; searchName?: string; brand: string; score: number;
  points: EffPoint[]; fitted?: boolean; recommended?: boolean; hardwareId?: string;
}
export interface BenchmarkSet {
  id: string; label: string; platform: Platform; component: Component; mode: ViewMode;
  metric: string; unit: string; powerLabel: string; source: string; sourceUrl: string;
  checkedAt: string; version: string; note: string; legacy?: boolean; rows: PerformanceRow[];
}
interface SourceSeries {
  id: string; name: string; name_en: string; group: string;
  meta: { suite?: string; coreName?: string; coreGroup?: string; fitted?: boolean; defaultVisible?: boolean };
  points: number[] | number[][];
}
export interface SocpkSnapshot {
  retrieved_at: string;
  pages: {slug: string; title: string; type: string; source_url: string; version: string; payload_sha256: string; series: SourceSeries[]}[];
}
const brandNames: Record<string,string> = {"苹果":"Apple","高通":"Qualcomm","联发科":"MediaTek","三星":"Samsung","海思":"HiSilicon","华为":"HiSilicon","小米":"Xiaomi","谷歌":"Google"};
const brand = (group: string) => brandNames[group] || (group.startsWith("NVIDIA") ? "NVIDIA" : group.startsWith("AMD") ? "AMD" : group || "其他");
export const displayNumber = (value: number | null, digits=2) => value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("zh-CN",{maximumFractionDigits:digits});

export function desktopSets(): BenchmarkSet[] {
  const geek: BenchmarkSet[] = ([['cpu','gb7_multi','Geekbench 7 多核'],['cpu','gb7_single','Geekbench 7 单核'],['gpu','gb7_opencl','Geekbench 7 OpenCL']] as const).map(([type,metric,label])=>({
    id:`desktop-${metric}`,label,platform:"desktop" as Platform,component:type,mode:"tier" as ViewMode,metric:label,unit:"分",powerLabel:"标称功耗不用于生成曲线",
    source:"Geekbench Browser",sourceUrl:`https://browser.geekbench.com/${type==='cpu'?'processor':'opencl'}-benchmarks`,checkedAt:CHECKED_AT,version:"Geekbench 7",
    note:"用户提交成绩汇总快照；不是本站实测或实时全市场排名。OpenCL 衡量计算任务，不代表游戏帧率。",
    rows:chips.filter(c=>c.platform==='desktop' && c.type===type && c[metric]!=null).map(c=>({id:c.id,hardwareId:c.id,name:c.name,brand:c.brand,score:c[metric]!,points:[]})).sort((a,b)=>b.score-a.score),
  }));
  // 工作簿参考成绩；无成绩型号仅进入全量规格库。
  const cpuSets: BenchmarkSet[] = (["desktop", "mobile"] as const).flatMap(platform =>
    ([['cpuz_composite','综合'],['cpuz_multi','多核']] as const).map(([metric,label]) => ({
      id:`ladder-cpuz-${metric === 'cpuz_composite' ? 'composite' : 'multi'}${platform === 'mobile' ? '-mobile' : ''}`,
      label:`CPU-Z ${label}（${platform === 'desktop' ? '桌面' : '笔记本'}天梯表）`,
      platform,component:"cpu",mode:"tier",metric:`CPU-Z ${label}`,unit:"分",powerLabel:"天梯表标称功耗不用于生成曲线",
      source:"天梯图综合全世代（用户提供）",sourceUrl:"https://www.cpu-z.com/bench/",checkedAt:LADDER_CHECKED_AT,version:"CPU-Z Bench",
      note:"仅比较同平台的表内参考成绩，不代表本站实测；不同整机的散热、内存与功耗设定仍会影响成绩。",
      rows:ladderCpus.filter(c=>c.platform===platform).map(c=>({id:c.id,name:c.name,brand:c.brand,score:c[metric],points:[]})).sort((a,b)=>b.score-a.score),
    })));
  const ladderSets: BenchmarkSet[] = [
    ...cpuSets,
    { id:"ladder-tdmark-ts",label:"3DMark Time Spy（天梯表）",platform:"desktop",component:"gpu",mode:"tier",
      metric:"3DMark Time Spy",unit:"分",powerLabel:"天梯表 TDP 不用于生成曲线",
      source:"天梯图综合全世代（用户提供）",sourceUrl:"https://www.3dmark.com/search",checkedAt:LADDER_CHECKED_AT,version:"3DMark Time Spy",
      note:"仅统计表内有 Time Spy 参考成绩的桌面显卡；缺失值不使用理论性能分补齐。",
      rows:ladderGpus.filter(g=>!g.ts_estimated && g.platform==='desktop').map(g=>({id:g.id,name:g.name,brand:g.brand,score:g.tdmark_ts,points:[]})).sort((a,b)=>b.score-a.score) },
    { id:"ladder-tdmark-integrated",label:"3DMark Time Spy · 核显（天梯表）",platform:"desktop",component:"gpu",mode:"tier",
      metric:"3DMark Time Spy",unit:"分",powerLabel:"天梯表 TDP 不用于生成曲线",
      source:"天梯图综合全世代（用户提供）",sourceUrl:"https://www.3dmark.com/search",checkedAt:LADDER_CHECKED_AT,version:"3DMark Time Spy",
      note:"核显 / APU 的表内 Time Spy 参考成绩；共享内存与驱动策略影响成绩，不与独显混为一榜。",
      rows:ladderGpus.filter(g=>!g.ts_estimated && g.platform==='integrated').map(g=>({id:g.id,name:g.name,brand:g.brand,score:g.tdmark_ts,points:[]})).sort((a,b)=>b.score-a.score) },
  ];
  return [...ladderSets, ...geek];
}

export function socpkSets(snapshot: SocpkSnapshot): BenchmarkSet[] {
  const sets: BenchmarkSet[]=[];
  function add(slug: string,id: string,label: string,component: Component,mode: ViewMode,metric: string,options: {index?:number;suite?:string;platform?:Platform;unit?:string;note?:string}={}) {
    const page=snapshot.pages.find(p=>p.slug===slug); if(!page)return;
    const rows=page.series.filter(s=>!options.suite || s.meta.suite===options.suite).map(s=>{
      const points=page.type==='line-chart'?normalizePoints((s.points as number[][]).map(([power,score])=>({power,score}))):[];
      const last=points.at(-1);
      return {id:`${id}:${s.id}`,name:s.meta.coreName?`${s.name} · ${s.meta.coreName}`:s.name,searchName:s.name_en,brand:brand(s.group),
        score:page.type==='line-chart'?(last?.score ?? 0):(s.points as number[])[options.index ?? 0],points,fitted:!!s.meta.fitted,recommended:!!s.meta.defaultVisible};
    }).filter(r=>Number.isFinite(r.score) && r.score>0 && (mode!=='curve' || r.points.length>=2)).sort((a,b)=>b.score-a.score);
    sets.push({id,label,platform:options.platform ?? 'phone',component,mode,metric,unit:options.unit ?? '分',powerLabel:options.platform==='mobile'?'来源显卡功耗（W）':'主板功耗（已扣除屏幕，W）',
      source:"SOCPK / 极客湾",sourceUrl:page.source_url,checkedAt:snapshot.retrieved_at.slice(0,10),version:page.version,
      legacy:page.type==='bar-chart',note:options.note || "来源为自购零售机测试；手机功耗为主板口径，不能当作芯片单独耗电或整机续航结论。",rows});
  }
  add('mobile-soc-spec26','spec26-int','SPEC CPU 2026 · 单核 INT','cpu','curve','SPEC CPU 2026 INT',{suite:'INT',note:'按核心分别展示整数负载；编译条件见来源，不能与 FP 或 Geekbench 分数混合比较。'});
  add('mobile-soc-spec26','spec26-fp','SPEC CPU 2026 · 单核 FP','cpu','curve','SPEC CPU 2026 FP',{suite:'FP',note:'按核心分别展示浮点负载；同一 SoC 的不同核心是独立曲线，不能合并成多核成绩。'});
  for(const suite of ['GB6','GB7'])add('mobile-soc-efficiency-gb7',`cpu-${suite.toLowerCase()}`,`Geekbench ${suite.slice(2)} · 多核`,'cpu','curve',`Geekbench ${suite.slice(2)} 多核`,{suite});
  add('mobile-soc-efficiency-snl','gpu-snl','3DMark Steel Nomad Light','gpu','curve','3DMark Steel Nomad Light');
  add('laptop-gpu-efficiency','laptop-timespy','3DMark Time Spy · 笔记本','gpu','curve','3DMark Time Spy',{platform:'mobile',note:'本页 RTX / GTX 名称均按来源的笔记本显卡测试上下文理解，不能与同名桌面显卡直接混用；来源说明采用默认设定、未超频或降压。'});
  add('laptop-gpu-efficiency','laptop-peak','Time Spy · 最高来源功耗点','gpu','tier','3DMark Time Spy',{platform:'mobile',note:'按每条曲线的最高来源功耗点排序；各型号上限不同，这不是相同功耗或同一整机配置下的排行榜。可切换曲线比较同功耗表现。'});
  add('chip-cpu','socpk-cpu','CPU 综合（历史）','cpu','tier','SOCPK CPU 指数',{note:'来源历史项目；单核权重 30%、多核权重 70%。指数不等于 Geekbench 分数，也不包含所有新芯片。'});
  add('chip-overall','socpk-overall','SoC 综合（历史）','cpu','tier','SOCPK 综合指数',{note:'来源历史项目；CPU 70%、GPU 30%，骁龙 865 为基准。不包含功耗、AI、ISP 或基带；来源含手机、平板及 Apple M 系列。'});
  add('chip-cpu-efficiency','socpk-efficiency','CPU 能效指数（历史）','cpu','tier','SOCPK CPU 能效指数',{note:'来源历史项目；采用 3–5 W 区间的多核性能计算，骁龙 865 为基准。不能把此指数等同于任意单个功耗点的分 / W。'});
  for(const ver of [6,5])for(const [index,part] of ['单核','多核'].entries())add(`geekbench-${ver}`,`socpk-gb${ver}-${index}`,`Geekbench ${ver} ${part}（历史）`,'cpu','tier',`Geekbench ${ver} ${part}`,{index,note:'来源历史榜单，保留来源的整机或核心配置名称；仅可比较同版本同项目成绩，不与桌面 Geekbench 7 汇总直接混排。'});
  add('chip-gpu','socpk-gpu','GPU 综合（历史）','gpu','tier','SOCPK GPU 指数',{note:'来源历史项目；峰值与持续性能各占 50%，以骁龙 865 为基准，持续成绩受温度和降频影响。'});
  add('3dmark-wle','socpk-wle','3DMark Wild Life Extreme（历史）','gpu','tier','3DMark Wild Life Extreme');
  for(const [index,res] of ['1080p','1440p'].entries())add('gfxbench-5',`socpk-gfx-${index}`,`GFXBench 5 ${res}（历史）`,'gpu','tier',`GFXBench 5 ${res}`,{index,unit:'fps',note:'来源取 Apple Metal、Android OpenGL / Vulkan 中的峰值结果；图形 API 不同，不能解释为同款游戏的帧率。'});
  return sets;
}
let pending: Promise<BenchmarkSet[]> | undefined;
export function loadSocpkSets(): Promise<BenchmarkSet[]> {
  return pending ??= import('./socpkCatalog.json').then(m=>socpkSets(m.default as unknown as SocpkSnapshot)).catch(error=>{pending=undefined;throw error;});
}
export function atPower(row: PerformanceRow,power: number) { return scoreAtPower(row.points,power); }
function csvRows(rows: unknown[][]): string {
  const safe=(v:unknown)=>{let s=String(v ?? '');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+rows.map(row=>row.map(safe).join(',')).join('\r\n');
}
export function comparisonCSV(set: BenchmarkSet,rows: PerformanceRow[],power: number): string {
  const header=['型号','品牌','测试项目','来源成绩 / 最高来源点成绩',`功耗 ${power} W 下的线性估算`,`该点 ${set.unit}/W`,'最高来源点功耗 W','来源','核对日期','来源版本'];
  return csvRows([header,...rows.map(r=>{const score=atPower(r,power);return [r.name,r.brand,set.metric,r.score,score==null?'':Number(score.toFixed(4)),score==null?'':Number((score/power).toFixed(4)),r.points.at(-1)?.power ?? '',set.sourceUrl,set.checkedAt,set.version];})]);
}
export function pointsCSV(set: BenchmarkSet,rows: PerformanceRow[]): string {
  return csvRows([['型号 / 核心','品牌','测试项目','来源功耗 W',`来源成绩 ${set.unit}`,'含拟合标记','来源','核对日期','来源版本'],
    ...rows.flatMap(r=>r.points.map(p=>[r.name,r.brand,set.metric,p.power,p.score,r.fitted?'是':'未标记',set.sourceUrl,set.checkedAt,set.version]))]);
}
