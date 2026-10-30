import json
import re
from urllib.parse import urlparse
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from ...db import q_all, q_one, tx
from ...deps import bad_request, conflict, csrf_protect, forbidden, not_found, require_roles, user_roles
from ...models import validate_flow_graph
from ...security import new_id, utcnow
from ...workflow import audit, enqueue, notify
from .retrieval import split_content

router = APIRouter(tags=["editorial"])
editor = require_roles("reviewer", "admin")


class SubmissionIn(BaseModel):
    kind: str = Field(pattern="^(guide|flow)$")
    entity_id: str | None = None
    title: str = Field(min_length=2, max_length=200)
    payload: dict


class ReviewIn(BaseModel):
    note: str = Field(min_length=2, max_length=2000)
    approve: bool


def view(s):
    return {**s, "payload": json.loads(s["payload"])}


def validate(data, kind):
    if data.get("privacy_review_required") and not data.get("privacy_reviewed"):
        raise bad_request("维修候选需要人工确认脱敏后才能提交")
    if not isinstance(data.get("category"), str) or not data["category"].strip():
        raise bad_request("请填写问题分类")
    refs = data.get("source_refs") or []
    if not refs or any(not isinstance(r, dict) or not r.get("title") or urlparse(r.get("url", "")).scheme != "https" or not urlparse(r.get("url", "")).netloc for r in refs):
        raise bad_request("需提供可追溯的 HTTPS 来源与标题")
    app = data.get("applicability", {})
    if not isinstance(app, dict) or not app.get("os_family") or app.get("risk_level") not in ("observe", "reversible"):
        raise bad_request("需声明适用系统与风险等级")
    if kind == "flow":
        errors = validate_flow_graph(data.get("graph", {}))
        if errors:
            raise bad_request("；".join(errors))
        if not data.get("symptom_keywords"):
            raise bad_request("流程需要症状关键词")
    elif not isinstance(data.get("content"), str) or len(data["content"].strip()) < 20:
        raise bad_request("指南正文过短")


@router.get("/admin/content")
def submissions(user=Depends(editor)):
    return {"submissions": [view(s) for s in q_all("SELECT * FROM content_submissions ORDER BY updated_at DESC LIMIT 200")],
            "guides": q_all("SELECT d.id,d.title,v.id AS version_id,v.version_no,v.status FROM knowledge_documents d "
                            "JOIN knowledge_versions v ON v.document_id=d.id ORDER BY d.title,v.version_no DESC"),
            "flows": q_all("SELECT f.id,f.title,v.id AS version_id,v.version_no,v.status FROM flows f "
                           "JOIN flow_versions v ON v.flow_id=f.id ORDER BY f.title,v.version_no DESC")}


@router.post("/admin/content", dependencies=[Depends(csrf_protect)])
def create(payload: SubmissionIn, user=Depends(editor)):
    sid = new_id("sub")
    now = utcnow().isoformat()
    with tx() as conn:
        if payload.entity_id:
            table = "flows" if payload.kind == "flow" else "knowledge_documents"
            if not q_one(f"SELECT id FROM {table} WHERE id=?", (payload.entity_id,), conn):
                raise not_found("原知识不存在")
        conn.execute("INSERT INTO content_submissions(id,kind,entity_id,title,payload,author_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
                     (sid, payload.kind, payload.entity_id, payload.title, json.dumps(payload.payload, ensure_ascii=False), user["id"], now, now))
        audit(conn, user["id"], "content_draft", "submission", sid)
    return {"id": sid}


@router.put("/admin/content/{sid}", dependencies=[Depends(csrf_protect)])
def update(sid: str, payload: SubmissionIn, user=Depends(editor)):
    with tx() as conn:
        s = q_one("SELECT * FROM content_submissions WHERE id=?", (sid,), conn)
        if not s or s["author_id"] != user["id"]:
            raise forbidden("仅作者可修改草稿")
        if s["status"] not in ("draft", "rejected") or payload.kind != s["kind"] or payload.entity_id != s["entity_id"]:
            raise conflict("待审或已发布内容不可修改，请创建新版本")
        conn.execute("UPDATE content_submissions SET title=?,payload=?,status='draft',updated_at=? WHERE id=?",
                     (payload.title, json.dumps(payload.payload, ensure_ascii=False), utcnow().isoformat(), sid))
    return {"ok": True}


@router.post("/admin/content/{sid}/submit", dependencies=[Depends(csrf_protect)])
def submit(sid: str, user=Depends(editor)):
    with tx() as conn:
        s = q_one("SELECT * FROM content_submissions WHERE id=?", (sid,), conn)
        if not s or s["author_id"] != user["id"]:
            raise forbidden()
        if s["status"] not in ("draft", "rejected"):
            raise conflict("当前内容不能重复提交")
        validate(json.loads(s["payload"]), s["kind"])
        conn.execute("UPDATE content_submissions SET status='pending',updated_at=? WHERE id=?", (utcnow().isoformat(), sid))
        audit(conn, user["id"], "content_submit", "submission", sid)
    return {"ok": True}


@router.post("/admin/content/{sid}/review", dependencies=[Depends(csrf_protect)])
def review(sid: str, payload: ReviewIn, user=Depends(editor)):
    with tx() as conn:
        s = q_one("SELECT * FROM content_submissions WHERE id=?", (sid,), conn)
        if not s:
            raise not_found("草稿不存在")
        if s["author_id"] == user["id"]:
            raise forbidden("作者不能审核自己提交的内容")
        if s["status"] != "pending":
            raise conflict("仅待审内容可审核")
        now = utcnow().isoformat()
        version_id = None
        if payload.approve:
            data = json.loads(s["payload"])
            validate(data, s["kind"])
            data["applicability"]["source_refs"] = data["source_refs"]
            flow = s["kind"] == "flow"
            parent_table, table, field = ("flows", "flow_versions", "flow_id") if flow else ("knowledge_documents", "knowledge_versions", "document_id")
            entity_id = s["entity_id"] or new_id("fl" if flow else "kd")
            if not s["entity_id"]:
                if flow:
                    conn.execute("INSERT INTO flows VALUES (?,?,?,?,?)", (entity_id, entity_id, s["title"], data["category"], now))
                else:
                    conn.execute("INSERT INTO knowledge_documents VALUES (?,?,?,?,?,?)", (entity_id, s["title"], data["category"],
                                 data["source_refs"][0]["url"], user["display_name"], now))
            version = q_one(f"SELECT MAX(version_no) AS n FROM {table} WHERE {field}=?", (entity_id,), conn)["n"] or 0
            conn.execute(f"UPDATE {table} SET status='superseded' WHERE {field}=? AND status='published'", (entity_id,))
            version_id = new_id("fv" if flow else "kv")
            if flow:
                graph = data["graph"]
                graph["applicability"] = data["applicability"]
                conn.execute("INSERT INTO flow_versions VALUES (?,?,?,'published',?,?,?,?,?,?)", (
                    version_id, entity_id, version + 1, json.dumps(graph, ensure_ascii=False),
                    json.dumps(data["symptom_keywords"], ensure_ascii=False), "[]",
                    json.dumps(data["source_refs"], ensure_ascii=False), user["display_name"], now))
            else:
                conn.execute("INSERT INTO knowledge_versions VALUES (?,?,?,'published',?,?,'public',?,?)", (
                    version_id, entity_id, version + 1, data["content"], json.dumps(data["applicability"], ensure_ascii=False), now, now))
                for seq, text in enumerate(split_content(data["content"])):
                    conn.execute("INSERT INTO knowledge_chunks(id,version_id,seq,text,tags) VALUES (?,?,?,?,?)", (
                        new_id("kc"), version_id, seq, text, json.dumps([data["category"]])))
                enqueue(conn, "index_knowledge", {"version_id": version_id})
            conn.execute("UPDATE content_submissions SET entity_id=? WHERE id=?", (entity_id, sid))
        conn.execute("UPDATE content_submissions SET status=?,reviewer_id=?,review_note=?,version_id=?,updated_at=? WHERE id=?", (
            "published" if payload.approve else "rejected", user["id"], payload.note, version_id, now, sid))
        notify(conn, s["author_id"], "知识审核结果", payload.note, "/admin/knowledge")
        audit(conn, user["id"], "content_review", "submission", sid, payload.model_dump())
    return {"ok": True, "version_id": version_id}


@router.post("/admin/content/{sid}/copy", dependencies=[Depends(csrf_protect)])
def copy_version(sid: str, user=Depends(editor)):
    s = q_one("SELECT * FROM content_submissions WHERE id=?", (sid,))
    if not s:
        raise not_found("版本不存在")
    return create(SubmissionIn(kind=s["kind"], entity_id=s["entity_id"], title=s["title"], payload=json.loads(s["payload"])), user)


@router.post("/admin/knowledge/{vid}/reindex", dependencies=[Depends(csrf_protect)])
def reindex(vid: str, user=Depends(editor)):
    with tx() as conn:
        version = q_one("SELECT status FROM knowledge_versions WHERE id=?", (vid,), conn)
        if not version or version["status"] != "published":
            raise conflict("仅当前发布的版本可重建索引")
        enqueue(conn, "index_knowledge", {"version_id": vid})
        audit(conn, user["id"], "knowledge_reindex", "knowledge", vid)
    return {"queued": True}


@router.post("/staff/tickets/{tid}/case-candidate", dependencies=[Depends(csrf_protect)])
def candidate(tid: str, user=Depends(require_roles("staff", "admin"))):
    with tx() as conn:
        ticket = q_one("SELECT * FROM tickets WHERE id=?", (tid,), conn)
        if not ticket or (ticket["assignee_id"] != user["id"] and "admin" not in user_roles(user["id"], conn)):
            raise forbidden()
        if ticket["status"] != "CLOSED":
            raise conflict("结单后才能生成候选")
        records = q_all("SELECT cause,action_taken,verification FROM repair_records WHERE ticket_id=?", (tid,), conn)
        def redact(text):
            text = re.sub(r"[\w.+-]+@[\w.-]+", "[邮箱已移除]", text)
            return re.sub(r"(?<!\d)1[3-9]\d{9}(?!\d)", "[手机号已移除]", text)
        content = "\n\n".join(redact(f"原因：{r['cause']}\n处理：{r['action_taken']}\n验证：{r['verification']}") for r in records)
        sid, now = new_id("sub"), utcnow().isoformat()
        payload = {"category": ticket["category"] or "app", "content": content,
                   "source_refs": [], "applicability": {"os_family": "windows", "risk_level": "observe"},
                   "privacy_review_required": True}
        # 不复制标题、用户描述、联系人、会话及附件；候选不能直接发布。
        conn.execute("INSERT INTO content_submissions(id,kind,title,payload,author_id,created_at,updated_at) VALUES (?,'guide',?,?,?,?,?)",
                     (sid, "维修经验候选（需脱敏及技术复核）", json.dumps(payload, ensure_ascii=False), user["id"], now, now))
        audit(conn, user["id"], "case_candidate", "submission", sid)
    return {"id": sid, "status": "draft"}
