import { Link } from "react-router-dom";
import { useState } from "react";
import { useDebouncedValue, useResource } from "../hooks/useResource";
import type { Guide } from "../types";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncState";
const CATEGORIES: Record<string, string> = {
  network: "网络连接",
  audio: "声音与外设",
  display: "显示问题",
  performance: "性能与空间",
  app: "应用软件",
};
export default function Guides() {
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim());
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (search) params.set("q", search);
  const { data, loading, error, reload } = useResource<Guide[]>(
    `/guides?${params}`,
  );
  return (
    <div>
      <PageHeader
        eyebrow="KNOWLEDGE LIBRARY / 问题指南"
        title="常见问题，慢慢弄明白。"
        description="按分类查找电脑问题，了解适用环境与操作步骤。开始前，请先确认指南是否适合你的设备。"
        actions={
          <Link className="btn" to="/help">
            <Icon name="tool" size={16} />
            需要排查帮助
          </Link>
        }
      />
      <section className="card">
        <div className="guide-filter">
          <select
            aria-label="指南分类"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">全部分类</option>
            {Object.entries(CATEGORIES).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
          <div className="search-field">
            <Icon name="search" size={17} />
            <input
              aria-label="搜索指南"
              placeholder="搜索症状或关键词"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          {(q || category) && (
            <button
              className="text-button"
              onClick={() => {
                setQ("");
                setCategory("");
              }}
            >
              重置
            </button>
          )}
        </div>
      </section>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading ? (
        <LoadingState label="正在查找问题指南…" />
      ) : !data?.length ? (
        <section className="card">
          <EmptyState
            title="没有匹配的指南"
            description="试试其他关键词，或选择全部分类。"
          />
        </section>
      ) : (
        <>
          <p className="muted small" role="status">
            找到 {data.length} 篇指南
          </p>
          <div className="guide-grid">
            {data.map((guide) => (
              <article className="card guide-card" key={guide.id}>
                <div className="guide-category">
                  <Icon
                    name="book"
                    size={16}
                    style={{ verticalAlign: "middle", marginRight: 7 }}
                  />
                  {CATEGORIES[guide.category] || guide.category}
                </div>
                <h3>
                  <Link to={`/guides/${guide.id}`}>{guide.title}</Link>
                </h3>
                <div className="guide-meta">
                  <span className="badge badge-neutral">
                    约 {guide.estimated_minutes} 分钟
                  </span>
                  <span
                    className={`badge ${guide.difficulty === "easy" ? "badge-ok" : "badge-warn"}`}
                  >
                    {guide.difficulty === "easy" ? "简单" : "中等"}
                  </span>
                </div>
                <div className="guide-bottom">
                  <span>
                    {guide.reviewed_at ? `审核 ${guide.reviewed_at.slice(0, 10)}` : "待人工复核"} · v
                    {guide.version_no}
                  </span>
                  <Link
                    className="guide-read-link"
                    to={`/guides/${guide.id}`}
                    aria-label={`阅读 ${guide.title}`}
                  >
                    阅读指南
                    <Icon name="arrow" size={17} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
