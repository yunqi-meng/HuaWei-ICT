import { Link, useParams } from "react-router-dom";
import { useResource } from "../hooks/useResource";
import { LoadingState, ErrorState, EmptyState } from "../components/AsyncState";
import HardwareSources from "../components/HardwareSources";
import PageHeader from "../components/PageHeader";
import { CPU_METRICS, GPU_METRICS, formatValue, type Chip } from "../data/hardware";

export default function HardwareDetail() {
  const { id } = useParams();
  const { data: chip, loading, error, reload } = useResource<Chip>(id ? `/hardware/chips/${encodeURIComponent(id)}` : null);
  if (loading) return <LoadingState label="正在加载芯片详情…" />;
  if (error || !chip) return <><ErrorState message={error || "未找到该芯片"} retry={reload} /><Link className="btn" to="/hardware">返回硬件数据库</Link></>;
  const cpu = chip.type === "cpu";
  const fields: [string, unknown, string?][] = [
    ["架构", chip.arch], ["制程工艺", chip.process],
    [`标称功耗（${chip.power_label}）`, chip.tdp, " W"],
    ...(cpu ? [
      ["核心配置", chip.cores], ["线程数", chip.threads],
      ["基础频率（异构 CPU 为性能核）", chip.base_clock, " GHz"],
      ["最高加速频率", chip.boost_clock, " GHz"], ["内存支持", chip.memory],
      ["最大睿频功耗（MTP，仅 Intel）", chip.max_power, " W"],
    ] as [string, unknown, string?][] : [
      ["显存容量", chip.vram, " GB"], ["显存类型", chip.vram_type], ["显存位宽", chip.bus_width, " bit"],
    ] as [string, unknown, string?][]),
  ];
  const values = chip as unknown as Record<string, unknown>;
  return <div>
    <PageHeader title={chip.name} description={`${chip.brand} · ${chip.type.toUpperCase()} · ${chip.year}`} actions={<Link className="btn" to="/hardware">返回硬件数据库 →</Link>} />
    <HardwareSources chip={chip} />
    <section className="card"><h2>基本规格</h2><dl className="audited-specs">{fields.map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{formatValue(value, unit)}</dd></div>)}</dl></section>
    <section className="card"><h2>基准测试成绩</h2><dl className="audited-specs">{(cpu ? CPU_METRICS : GPU_METRICS).map(m => <div key={m.key}><dt>{m.label}</dt><dd>{formatValue(values[m.key])}</dd></div>)}</dl></section>
    <section className="card"><EmptyState title="暂无可核验的实测能耗曲线" description="原有估算点已撤下。标称功耗与跑分不能组合成同一测试条件下的性能功耗曲线。" /></section>
    <Link className="btn btn-primary" to="/hardware/rankings">查看有来源的排行榜 →</Link>
  </div>;
}
