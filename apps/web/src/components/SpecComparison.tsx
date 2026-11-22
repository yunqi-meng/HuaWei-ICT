import Modal from "./Modal";

interface SpecRow { label: string; values: string[]; }
export default function SpecComparison({ names, rows, onClose }: {
  names: string[]; rows: SpecRow[]; onClose: () => void;
}) {
  return <Modal title="硬件规格对比" onClose={onClose} wide>
    <p className="muted">缺失字段显示“未提供”。标称功耗、供电相数和历史参考价各有不同含义，不用于生成综合评分。</p>
    <div className="table-scroll spec-comparison" tabIndex={0} role="region" aria-label="可横向滚动的数据表"><table>
      <thead><tr><th scope="col">项目</th>{names.map(name => <th key={name} scope="col">{name}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>
        {row.values.map((value, i) => <td key={i}>{value || "未提供"}</td>)}</tr>)}</tbody>
    </table></div>
  </Modal>;
}
