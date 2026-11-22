import type { SourceRef } from "../data/ladder";

export default function WorkbookSource({ source }: { source: SourceRef }) {
  return <p className="muted small workbook-source">来源：{source.file} · {source.sheet} · 第 {source.row} 行</p>;
}
