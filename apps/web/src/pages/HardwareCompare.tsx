import { Link, useSearchParams } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useResource } from "../hooks/useResource";
import PageHeader from "../components/PageHeader";
import HardwareSources from "../components/HardwareSources";
import { LoadingState, ErrorState, EmptyState } from "../components/AsyncState";
import { CPU_METRICS, GPU_METRICS, formatValue, type Chip } from "../data/hardware";
const COLORS = ["#c64a0b", "#3979a9", "#7553b5", "#b45c8c", "#708532", "#356c66"];
export default function HardwareCompare() {
  const [params] = useSearchParams();
  const ids = [...new Set((params.get("ids") || "").split(",").filter(Boolean))];
  const valid = ids.length >= 2 && ids.length <= 6;
  const { data, loading, error, reload } = useResource<{items: Chip[]}>(valid ? "/hardware/compare" : null, ids);
  if (ids.length > 6) return <ErrorState message="最多对比 6 款芯片，请返回数据库重新选择。" />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} retry={reload} />;
  const items = data?.items || [];
  if (!valid) return <section className="card"><EmptyState title="选择至少两款同类型芯片" description="在硬件数据库加入对比后，可并排查看规格与成绩。" /><Link className="btn btn-primary" to="/hardware">选择芯片 →</Link></section>;
  if (!items.length || new Set(items.map(c => c.type)).size !== 1) return <ErrorState message="未找到可对比的同类型芯片。" />;
  const cpu = items[0].type === "cpu";
  const metrics = cpu ? CPU_METRICS : GPU_METRICS;
  const fields = [
    ["品牌", "brand"], ["年份", "year"], ["架构", "arch"], ["工艺", "process"],
    ["标称功耗口径", "power_label"], ["标称功耗（W）", "tdp"],
    ...(cpu ? [["最大睿频功耗 MTP（W，仅 Intel）", "max_power"], ["核心", "cores"], ["线程", "threads"], ["最高加速频率（GHz）", "boost_clock"], ["内存", "memory"]]
      : [["显存（GB）", "vram"], ["显存类型", "vram_type"], ["位宽（bit）", "bus_width"]]),
    ...metrics.map(m => [m.label, m.key]),
  ];
  const value = (c: Chip, key: string) => (c as unknown as Record<string, unknown>)[key];
  const common = metrics.filter(m => items.every(c => typeof value(c,m.key) === "number"));
  return <div>
    <PageHeader title="硬件对比" description="同版本成绩并排比较；缺失成绩不按零分处理。" actions={<Link className="btn" to="/hardware">重新选择 →</Link>} />
    <HardwareSources />
    <section className="card table-scroll"><table><thead><tr><th>参数</th>{items.map(c => <th key={c.id}><Link to={`/hardware/${c.id}`}>{c.name} ↗</Link></th>)}</tr></thead>
      <tbody>{fields.map(([label,key]) => <tr key={key}><th>{label}</th>{items.map(c => <td key={c.id}>{formatValue(value(c,key))}</td>)}</tr>)}</tbody></table></section>
    {!common.length && <section className="card"><EmptyState title="缺少可供所有所选型号比较的成绩" description="仍可比较上方规格。只有同版本、来源明确且完整的测试指标才生成图表。" /></section>}
    {common.map(m => <section className="card" key={m.key}><h2>{m.label}</h2><ResponsiveContainer width="100%" height={320}>
      <BarChart data={[Object.fromEntries([["metric",m.label], ...items.map(c => [c.id,value(c,m.key)])])]}>
        <XAxis dataKey="metric" /><YAxis /><Tooltip /><Legend />{items.map((c,i) => <Bar key={c.id} dataKey={c.id} name={c.name} fill={COLORS[i]} isAnimationActive={false} />)}
      </BarChart></ResponsiveContainer></section>)}
    {items.map(c => <details className="card" key={c.id}><summary>{c.name} 的资料来源</summary><HardwareSources chip={c} /></details>)}
  </div>;
}
