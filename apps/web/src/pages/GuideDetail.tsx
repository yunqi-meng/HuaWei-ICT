import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import type { Guide } from "../types";

/** 极简 Markdown 渲染：仅标题/加粗/列表/行内代码，禁原始 HTML（方案 14 安全要求）。 */
function renderMarkdown(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("## ")) return <h3 key={i}>{line.slice(3)}</h3>;
    if (line.startsWith("# ")) return <h2 key={i}>{line.slice(2)}</h2>;
    const html = line
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
    if (/^\d+\. /.test(line) || line.startsWith("- ")) {
      return <li key={i} dangerouslySetInnerHTML={{ __html: html.replace(/^\d+\. |- /, "") }} />;
    }
    if (!line.trim()) return null;
    return <p key={i} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

export default function GuideDetail() {
  const { id } = useParams();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<Guide>(`/guides/${id}`).then(setGuide).catch((e) => setErr((e as Error).message));
  }, [id]);

  if (err) return <div className="error-box">{err}</div>;
  if (!guide) return <p className="muted">加载中…</p>;

  return (
    <div className="card">
      <h2>{guide.title}</h2>
      <p className="muted small">
        适用：{guide.os_family} · 预计 {guide.estimated_minutes} 分钟 ·
        版本 v{guide.version_no} · 审核于 {guide.reviewed_at?.slice(0, 10) ?? "-"}
      </p>
      <div>{renderMarkdown(guide.content ?? "")}</div>
      <p className="muted small">来源：{guide.source_url}</p>
    </div>
  );
}
