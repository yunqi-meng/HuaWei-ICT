import { Link, useParams } from "react-router-dom";
import { useResource } from "../hooks/useResource";
import { LoadingState, ErrorState } from "../components/AsyncState";
import PageHeader from "../components/PageHeader";
import Markdown from "../components/Markdown";
import type { Guide } from "../types";
export default function GuideDetail() {
  const { id } = useParams();
  const {
    data: guide,
    loading,
    error,
    reload,
  } = useResource<Guide>(id ? `/guides/${encodeURIComponent(id)}` : null);
  if (loading) return <LoadingState label="正在加载指南…" />;
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!guide) return null;
  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <PageHeader
        eyebrow="KNOWLEDGE / 问题指南"
        title={guide.title}
        description={`适用系统：${guide.os_family} · 约 ${guide.estimated_minutes} 分钟 · 版本 v${guide.version_no}`}
        actions={
          <Link className="btn btn-ghost" to="/guides">
            返回指南库
          </Link>
        }
      />
      <article className="card">
        <Markdown text={guide.content || "暂无正文内容"} />
        <div className="notice subtle" style={{ marginTop: 28 }}>
          {guide.reviewed_at ? `审核日期：${guide.reviewed_at.slice(0, 10)}` : "待人工复核：当前内容未提供人工审核记录"} · 来源：
          {/^https?:\/\//i.test(guide.source_url) ? (
            <a
              href={guide.source_url}
              target="_blank"
              rel="noreferrer"
              style={{ overflowWrap: "anywhere" }}
            >
              查看原始资料 ↗
            </a>
          ) : (
            guide.source_url || "未提供"
          )}
        </div>
      </article>
      <div className="page-links">
        <Link to="/help">需要进一步帮助？开始排查 →</Link>
      </div>
    </div>
  );
}
