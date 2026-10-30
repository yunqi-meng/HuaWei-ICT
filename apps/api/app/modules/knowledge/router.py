"""知识模块：指南浏览、检索与知识运营下架。

检索策略（方案 9.3 的 MVP 版）：关键词为主；若适配层可用向量，
则并行召回后简单融合。只命中 published + public 版本。
"""
import json

from fastapi import APIRouter, Depends, Query

from ...db import q_all, q_one, run
from ...deps import csrf_protect, get_current_user, not_found, require_roles
from ...security import utcnow, new_id
from ..integrations.llm import get_llm

router = APIRouter(tags=["knowledge"])


def guide_view(row: dict, full: bool = False) -> dict:
    app = json.loads(row["applicability"] or "{}")
    view = {
        "id": row["doc_id"], "title": row["title"], "category": row["category"],
        "version_no": row["version_no"],
        "os_family": app.get("os_family", "windows"),
        "symptom_tags": app.get("symptom_tags", []),
        "risk_level": app.get("risk_level", "observe"),
        "estimated_minutes": app.get("estimated_minutes", 10),
        "difficulty": app.get("difficulty", "easy"),
        "source_url": (app.get("source_refs") or [{}])[0].get("url", row["source_url"]),
        "reviewed_at": row["reviewed_at"],
    }
    if full:
        view["content"] = row["content"]
    return view


_PUBLISHED_SQL = (
    "SELECT v.id AS version_id, v.version_no, v.content, v.applicability, v.reviewed_at, "
    "d.id AS doc_id, d.title, d.category, d.source_url "
    "FROM knowledge_versions v JOIN knowledge_documents d ON d.id = v.document_id "
    "WHERE v.status = 'published' AND v.visibility = 'public'"
)


@router.get("/guides")
def list_guides(category: str | None = Query(default=None), q: str | None = Query(default=None)):
    sql = _PUBLISHED_SQL
    params: list = []
    if category:
        sql += " AND d.category = ?"
        params.append(category)
    rows = q_all(sql, tuple(params))
    if q:
        ql = q.lower()
        rows = [r for r in rows
                if ql in r["title"].lower() or ql in r["content"].lower()
                or any(ql in t.lower() for t in json.loads(r["applicability"] or "{}").get("symptom_tags", []))]
    return [guide_view(r) for r in rows]


@router.get("/guides/{doc_id}")
def guide_detail(doc_id: str):
    row = q_one(_PUBLISHED_SQL + " AND d.id = ? ORDER BY v.version_no DESC LIMIT 1", (doc_id,))
    if not row:
        raise not_found("指南不存在或未发布")
    return guide_view(row, full=True)


@router.get("/search/knowledge")
def search_knowledge(q: str = Query(min_length=1, max_length=200),
                     os_family: str = "windows", category: str = "",
                     user: dict = Depends(get_current_user)):
    """诊断引擎与前端共用的知识检索。返回服务器绑定的引用 ID。"""
    from .retrieval import search
    return search(q, user["id"], os_family, category)


@router.get("/flows/published")
def list_published_flows():
    rows = q_all(
        "SELECT f.key AS flow_key, f.title, f.category, v.version_no, v.reviewer "
        "FROM flow_versions v JOIN flows f ON f.id = v.flow_id WHERE v.status = 'published'")
    return rows


# ---------- 知识运营（管理员）：下架 / 撤回 ----------

@router.post("/admin/knowledge/{version_id}/withdraw", dependencies=[Depends(csrf_protect)])
def withdraw_knowledge(version_id: str, admin: dict = Depends(require_roles("admin"))):
    """安全下架：立即生效，新检索不再命中。"""
    ver = q_one("SELECT id FROM knowledge_versions WHERE id = ?", (version_id,))
    if not ver:
        raise not_found("知识版本不存在")
    run("UPDATE knowledge_versions SET status = 'withdrawn' WHERE id = ?", (version_id,))
    run("INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, created_at) "
        "VALUES (?,?,?,?,?,?)",
        (new_id("aud"), admin["id"], "knowledge_withdraw",
         "knowledge_version", version_id, utcnow().isoformat()))
    return {"ok": True, "status": "withdrawn"}


@router.post("/admin/flows/{flow_version_id}/withdraw", dependencies=[Depends(csrf_protect)])
def withdraw_flow(flow_version_id: str, admin: dict = Depends(require_roles("admin"))):
    """流程安全撤回：活跃会话再次读取该版本时会被阻断并提示转人工（方案 7.2）。"""
    fv = q_one("SELECT id FROM flow_versions WHERE id = ?", (flow_version_id,))
    if not fv:
        raise not_found("流程版本不存在")
    run("UPDATE flow_versions SET status = 'withdrawn' WHERE id = ?", (flow_version_id,))
    run("INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, created_at) "
        "VALUES (?,?,?,?,?,?)",
        (new_id("aud"), admin["id"], "flow_withdraw",
         "flow_version", flow_version_id, utcnow().isoformat()))
    return {"ok": True, "status": "withdrawn"}
