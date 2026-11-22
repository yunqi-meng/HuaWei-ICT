"""中文词组/双字 BM25 + 同模型向量召回 + RRF + 可选重排序。"""
import collections
import json
import math
import re
import time
from ...config import get_settings
from ...content_policy import reviewed_content_clause
from ...db import q_all, q_one, tx
from ...security import new_id, utcnow
from ..integrations.llm import get_llm


def tokens(text):
    text = text.lower()
    for a, b in (("wi-fi", "wifi"), ("没声", "无声"), ("上不了网", "无法联网"), ("卡顿", "很慢")):
        text = text.replace(a, b)
    words = re.findall(r"[a-z0-9_.-]+|[\u4e00-\u9fff]+", text)
    return [token for word in words for token in (
        [word] if not re.match(r"[\u4e00-\u9fff]", word) else ([word] + [word[i:i+2] for i in range(len(word)-1)]))]


def split_content(content):
    sections = [p.strip() for p in content.split("\n\n") if p.strip()]
    # 保留完整段落，操作与同段警告不会被按字符硬切开。
    return sections or [content]


def build_index(version_id):
    version = q_one("SELECT * FROM knowledge_versions WHERE id=?", (version_id,))
    if not version or version["status"] != "published":
        return
    chunks = q_all("SELECT id,text FROM knowledge_chunks WHERE version_id=? ORDER BY seq", (version_id,))
    llm = get_llm()
    if not chunks or not llm.embedding_enabled:
        return  # 未启用向量时仅使用 BM25，属于明确配置的运行方式。
    vectors = llm.embed([c["text"] for c in chunks])
    if not vectors:
        raise RuntimeError("Embedding service unavailable")  # Worker 保留载荷并重试。
    if len(vectors) != len(chunks) or not valid_vectors(vectors):
        raise ValueError("Invalid embedding response")
    with tx() as conn:
        current = q_one("SELECT status FROM knowledge_versions WHERE id=?", (version_id,), conn)
        if not current or current["status"] != "published":
            return
        for c, vector in zip(chunks, vectors):
            conn.execute("UPDATE knowledge_chunks SET embedding=?,index_version=? WHERE id=?", (
                json.dumps({"model": get_settings().maas_embedding_model, "values": vector}), "hybrid-v1", c["id"]))
        if get_settings().database_url.startswith("postgres"):
            # 扩展权限不可用时只退回 JSON 向量，不丢失关键词索引。
            conn.execute("SAVEPOINT optional_vector_index")
            try:
                conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
                conn.execute("CREATE TABLE IF NOT EXISTS knowledge_vectors (chunk_id TEXT PRIMARY KEY REFERENCES knowledge_chunks(id) ON DELETE CASCADE, model TEXT NOT NULL, embedding vector NOT NULL)")
                for c, vector in zip(chunks, vectors):
                    conn.execute("INSERT INTO knowledge_vectors VALUES (?,?,?::vector) ON CONFLICT(chunk_id) DO UPDATE SET model=EXCLUDED.model,embedding=EXCLUDED.embedding",
                                 (c["id"], get_settings().maas_embedding_model, json.dumps(vector)))
                conn.execute("RELEASE SAVEPOINT optional_vector_index")
            except Exception:
                conn.execute("ROLLBACK TO SAVEPOINT optional_vector_index")
                conn.execute("RELEASE SAVEPOINT optional_vector_index")


def valid_vectors(vectors):
    return bool(vectors and isinstance(vectors, list) and isinstance(vectors[0], list) and vectors[0]) and all(
        isinstance(v, list) and len(v) == len(vectors[0]) and all(isinstance(x, (int, float)) and math.isfinite(x) for x in v)
        for v in vectors)


def search(query, user_id, os_family="windows", category="", limit=5, trace=True):
    started = time.monotonic()
    chunks = q_all("SELECT c.*,v.applicability,v.version_no,d.title,d.id AS document_id,d.source_url "
                   "FROM knowledge_chunks c JOIN knowledge_versions v ON v.id=c.version_id "
                   "JOIN knowledge_documents d ON d.id=v.document_id WHERE v.status='published' AND v.visibility='public'"
                   + reviewed_content_clause("v"))
    allowed = []
    for c in chunks:
        app = json.loads(c["applicability"] or "{}")
        if app.get("os_family", "windows") not in (os_family, "any") or app.get("risk_level") == "high":
            continue
        if category and category not in app.get("symptom_tags", []):
            continue
        if app.get("expires_at") and app["expires_at"] < utcnow().date().isoformat():
            continue
        allowed.append(c)
    corpus = [collections.Counter(tokens(c["title"] + " " + c["text"])) for c in allowed]
    query_tokens = set(tokens(query))
    lengths = [sum(bag.values()) for bag in corpus]
    avg_len = sum(lengths) / max(1, len(corpus))
    document_frequency = collections.Counter(token for bag in corpus for token in bag)
    scored = []
    for c, bag, length in zip(allowed, corpus, lengths):
        score = 0.0
        for token in query_tokens:
            frequency = bag[token]
            if not frequency:
                continue
            df = document_frequency[token]
            idf = math.log(1 + (len(corpus) - df + .5) / (df + .5))
            score += idf * frequency * 2.2 / (frequency + 1.2 * (.25 + .75 * length / max(1, avg_len)))
        if score > 0:
            scored.append((score, c))
    lexical = [c for _, c in sorted(scored, key=lambda x: -x[0])[:20]]
    vector_rank = []
    llm = get_llm()
    if llm.embedding_enabled and any(c["embedding"] for c in allowed):
        qvs = llm.embed([query])
        if qvs and valid_vectors(qvs):
            qv = qvs[0]
            postgres_ranking = None
            if get_settings().database_url.startswith("postgres") and allowed:
                try:
                    ids = [c["id"] for c in allowed]
                    placeholders = ",".join("?" for _ in ids)
                    postgres_ranking = q_all(f"SELECT chunk_id,1-(embedding <=> ?::vector) AS similarity FROM knowledge_vectors "
                                             f"WHERE model=? AND vector_dims(embedding)=? AND chunk_id IN ({placeholders}) "
                                             "ORDER BY embedding <=> ?::vector LIMIT 20", (
                                                 json.dumps(qv), get_settings().maas_embedding_model, len(qv), *ids, json.dumps(qv)))
                except Exception:
                    postgres_ranking = None
            pg_scores = {r["chunk_id"]: r["similarity"] for r in postgres_ranking} if postgres_ranking is not None else None
            for c in allowed:
                try:
                    if pg_scores is not None:
                        similarity = pg_scores.get(c["id"], 0)
                        if similarity > .2:
                            vector_rank.append((similarity, c))
                        continue
                    ev = json.loads(c["embedding"] or "{}")
                    values = ev.get("values", [])
                    if ev.get("model") != get_settings().maas_embedding_model or len(values) != len(qv):
                        continue
                    norm = math.sqrt(sum(x*x for x in qv) * sum(x*x for x in values))
                    similarity = sum(x*y for x, y in zip(qv, values)) / norm if norm else 0
                    if similarity > .2:
                        vector_rank.append((similarity, c))
                except (ValueError, TypeError, AttributeError):
                    continue
    vector_rank = [c for _, c in sorted(vector_rank, key=lambda x: -x[0])[:20]]
    ranks, by_id = collections.defaultdict(float), {}
    for ranking in (lexical, vector_rank):
        for rank, c in enumerate(ranking, 1):
            ranks[c["id"]] += 1 / (60 + rank)
            by_id[c["id"]] = c
    ranked = [by_id[cid] for cid in sorted(ranks, key=lambda cid: -ranks[cid])][:20]
    reranked = llm.rerank(query, [c["text"][:2000] for c in ranked], min(limit, len(ranked))) if ranked and llm.rerank_enabled else None
    if reranked and len(set(reranked)) == len(reranked) and all(isinstance(i, int) and 0 <= i < len(ranked) for i in reranked):
        # 重排作为第三路排名参与 RRF 融合，而不是直接覆盖：模型对口语化长查询偶尔会误判，
        # 直接覆盖会把关键词与向量都认可的结果排到后面。
        for rank, idx in enumerate(reranked, 1):
            ranks[ranked[idx]["id"]] += 1 / (60 + rank)
        ranked = sorted(ranked, key=lambda c: -ranks[c["id"]])
    results = [{"citation_id": c["id"], "document_id": c["document_id"], "version_id": c["version_id"],
                "version_no": c["version_no"], "title": c["title"],
                "source_url": (json.loads(c["applicability"] or "{}").get("source_refs") or [{}])[0].get("url", c["source_url"]),
                "snippet": c["text"][:900], "score": ranks[c["id"]]} for c in ranked[:limit]]
    mode = "hybrid" if vector_rank else "bm25"
    if trace:
        with tx() as conn:
            # 不落用户原始问题，保存去标识后的查询分类，避免检索日志保存个人信息。
            conn.execute("INSERT INTO retrieval_traces VALUES (?,?,?,?,?,?,?)", (
                new_id("ret"), user_id, category or "general", mode, json.dumps([r["citation_id"] for r in results]),
                int((time.monotonic() - started) * 1000), utcnow().isoformat()))
    return {"query": query, "results": results, "retrieval_mode": mode}
