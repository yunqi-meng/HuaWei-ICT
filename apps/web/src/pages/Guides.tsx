import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Guide } from "../types";

const CATEGORIES: Record<string, string> = {
  network: "网络", audio: "声音与外设", display: "显示",
  performance: "性能与空间", app: "应用",
};

export default function Guides() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    api<Guide[]>(`/guides?${params}`).then(setGuides).catch(() => setGuides([]));
  }, [category, q]);

  return (
    <div>
      <h2>问题指南库</h2>
      <div className="card">
        <div style={{ display: "flex", gap: 12 }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 200 }}>
            <option value="">全部分类</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input placeholder="搜索症状或关键词" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {guides.map((g) => (
        <div className="card" key={g.id}>
          <Link to={`/guides/${g.id}`}><h3 style={{ marginTop: 0 }}>{g.title}</h3></Link>
          <span className="badge badge-neutral">{CATEGORIES[g.category] ?? g.category}</span>{" "}
          <span className="badge badge-neutral">约 {g.estimated_minutes} 分钟</span>{" "}
          <span className={`badge ${g.difficulty === "easy" ? "badge-ok" : "badge-warn"}`}>
            {g.difficulty === "easy" ? "简单" : "中等"}
          </span>{" "}
          <span className="muted small">更新于 {g.reviewed_at?.slice(0, 10) ?? "-"} · v{g.version_no}</span>
        </div>
      ))}
      {guides.length === 0 && <p className="muted">没有匹配的指南。</p>}
    </div>
  );
}
