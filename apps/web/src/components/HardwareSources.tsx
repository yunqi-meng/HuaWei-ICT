import { CHECKED_AT } from "../data/hardware";

export default function HardwareSources({ chip }: { chip?: {
  checked_at: string;
  spec_source: { title: string; url: string };
  benchmark_source: { title: string; url: string } | null;
  benchmark_note: string;
  spec_note: string;
} }) {
  return <aside className="notice subtle" style={{ display: "block", margin: "16px 0" }}>
    <strong>数据核对：{chip?.checked_at || CHECKED_AT}</strong>
    <p>{chip?.spec_note || "厂商标称功耗与实测功耗不同，不能据此推算能耗曲线。缺少来源的数值不参与排名。"}</p>
    <p>{chip?.benchmark_note || "Geekbench 7 用户上传成绩汇总快照，非本站实测；只比较相同测试版本。OpenCL 为计算成绩，不代表游戏帧率。"}</p>
    <div className="card-actions">
      {chip ? <>
        <a className="text-button" href={chip.spec_source.url} target="_blank" rel="noreferrer">{chip.spec_source.title} ↗</a>
        {chip.benchmark_source && <a className="text-button" href={chip.benchmark_source.url} target="_blank" rel="noreferrer">{chip.benchmark_source.title} ↗</a>}
      </> : <>
        <a className="text-button" href="https://browser.geekbench.com/processor-benchmarks" target="_blank" rel="noreferrer">CPU 成绩来源 ↗</a>
        <a className="text-button" href="https://browser.geekbench.com/opencl-benchmarks" target="_blank" rel="noreferrer">GPU 成绩来源 ↗</a>
      </>}
    </div>
  </aside>;
}
