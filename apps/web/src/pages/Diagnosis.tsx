import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, newClientMessageId } from "../api";
import StepCard from "../components/StepCard";
import Attachments from "../components/Attachments";
import type { HandoffDraft, SessionView } from "../types";

export default function Diagnosis() {
  const { id } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState<SessionView | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<HandoffDraft | null>(null);
  const [evidence,setEvidence]=useState<{title:string;snippet:string;citation_id:string}[]>([]);
  const [explanation,setExplanation]=useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const pendingRequest=useRef({signature:"",key:""});
  function stableKey(signature:string){if(pendingRequest.current.signature!==signature)pendingRequest.current={signature,key:newClientMessageId()};return pendingRequest.current.key;}

  useEffect(() => {
    api<SessionView>(`/diagnosis-sessions/${id}`).then(setSession).catch((e) => {
      const err = e as { status?: number; message: string };
      setErr(err.status === 401 ? "请先登录后再继续排查" : err.message);
    });
  }, [id]);

  useEffect(()=>{
    const stream=new EventSource(`/api/v1/diagnosis-sessions/${id}/events`,{withCredentials:true});
    stream.addEventListener("session",event=>setSession(JSON.parse((event as MessageEvent).data)));
    return()=>stream.close();
  },[id]);
  useEffect(()=>{if(session?.symptom_category)api<{results:typeof evidence}>(`/diagnosis-sessions/${id}/evidence`).then(r=>setEvidence(r.results)).catch(()=>undefined);},[id,session?.symptom_category]);

  // 只在会话内容变化时滚动到底部；用户正在阅读/执行时不打扰（方案 5.4）
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [session?.messages.length, session?.current_step?.step_id]);

  async function sendOption(key: string) {
    if (!session) return;
    setBusy(true);
    setErr("");
    try {
      const s = await api<SessionView>(`/diagnosis-sessions/${session.id}/messages`, {
        body: { option_key: key, client_message_id: stableKey(`${session.id}:${session.version}:option:${key}`),version:session.version },
      });
      setSession(s);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendText() {
    if (!session || !text.trim()) return;
    setBusy(true);
    try {
      const s = await api<SessionView>(`/diagnosis-sessions/${session.id}/messages`, {
        body: { text: text.trim(), client_message_id: stableKey(`${session.id}:${session.version}:text:${text.trim()}`),version:session.version },
      });
      setSession(s);
      setText("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openHandoffDraft() {
    if (!session) return;
    const d = await api<HandoffDraft>(`/diagnosis-sessions/${session.id}/handoff-draft`, {
      method: "POST",
    });
    setDraft(d);
  }

  async function confirmTicket() {
    if (!session || !draft) return;
    setBusy(true);
    try {
      const t = await api<{ id: string }>("/tickets", {
        body: {
          title: draft.user_description.slice(0, 60) || "义诊工单",
          category: draft.category,
          session_id: session.id,
          handoff_confirmed: true,
          description:draft.user_description,
          idempotency_key: stableKey(`ticket:${session.id}:${draft.user_description}`),
        },
      });
      nav(`/appointments/new?ticketId=${t.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (err && !session) return <div className="error-box">{err}</div>;
  if (!session) return <p className="muted">正在恢复会话…</p>;

  const step = session.current_step;

  return (
    <div className="workbench">
      {/* 左栏：进度与已尝试记录 */}
      <aside className="side-left">
        <div className="card">
          <h4>本次排查</h4>
          {Boolean(session.facts.os)&&<p className="small">故障电脑系统：{String(session.facts.os)}</p>}
          <p className="small muted">{session.symptom_text}</p>
          <p>
            状态：
            <span className={`badge ${session.state === "RESOLVED" ? "badge-ok" : session.state === "HANDOFF" ? "badge-warn" : "badge-neutral"}`}>
              {{ GUIDE: "排查中", VERIFY:"等待你验证结果", CLARIFY: "确认环境", RESOLVED: "已解决 ✓", HANDOFF: "转人工", PAUSED: "已暂停", INTAKE: "接收中" }[session.state] ?? session.state}
            </span>
          </p>
        </div>
        <div className="card">
          <h4>已尝试记录</h4>
          <ul className="tried-list">
            {session.tried_steps.map((s, i) => (
              <li key={i}>{s.title ?? s.node} → {s.label ?? s.result}</li>
            ))}
            {session.tried_steps.length === 0 && <li className="muted">还没有尝试记录</li>}
          </ul>
        </div>
      </aside>

      {/* 中栏：对话与操作卡 */}
      <main>
        {session.risk_flags.length > 0 && (
          <div className="alert-danger">
            <strong>安全提醒：</strong>检测到高风险现象（{session.risk_flags.join("、")}）。
            请不要继续通电或拆机，建议直接转人工处理。
          </div>
        )}
        <div className="card chat-log" ref={chatRef}>
          {session.messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>{m.content}</div>
          ))}
        </div>

        {session.state === "RESOLVED" && (
          <div className="alert-ok"><strong>问题已解决 ✓</strong> 排查记录已保存，可在“我的服务”中查看。</div>
        )}

        {step && session.state !== "RESOLVED" && (
          <StepCard step={step} busy={busy}
                    onOption={(k) => void sendOption(k)}
                    onHandoff={() => void openHandoffDraft()} />
        )}

        {session.state === "HANDOFF" && (
          <div className="card">
            <h3>转人工义诊</h3>
            <p>{session.handoff_reason}</p>
            <button className="btn btn-primary" onClick={() => void openHandoffDraft()}>
              生成交接摘要并提交工单
            </button>
          </div>
        )}

        {err && <div className="error-box">{err}</div>}

        <div className="card">
          <div style={{ display: "flex", gap: 10 }}>
            <input
              placeholder="补充情况说明（不要输入密码、验证码等敏感信息）"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void sendText()}
            />
            <button className="btn" disabled={busy || !text.trim()} onClick={() => void sendText()}>发送</button>
          </div>
        </div>
      </main>

      {/* 右栏：设备与依据 */}
      <aside className="side-right">
        <div className="card"><h4>排障进度</h4><button className="btn" disabled={busy||!["GUIDE","CLARIFY","PAUSED"].includes(session.state)} onClick={()=>void api<SessionView>(`/diagnosis-sessions/${id}/${session.state==="PAUSED"?"resume":"pause"}`,{method:"POST"}).then(setSession).catch(e=>setErr(e.message))}>{session.state==="PAUSED"?"恢复排障":"暂停，稍后继续"}</button></div>
        <div className="card">
          <h4>依据与适用范围</h4>
          {step?.source_refs?.length ? (
            <ul className="small">
              {step.source_refs.map((s, i) => (
                <li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>
              ))}
            </ul>
          ) : (
            <p className="muted small">当前为环境确认阶段，匹配流程后将显示审核来源。</p>
          )}
          <p className="muted small">所有操作步骤均来自人工审核流程，系统不会执行任何远程操作。</p>
          {evidence.map(r=><details key={r.citation_id}><summary>{r.title}</summary><p className="small">{r.snippet}</p></details>)}
          <button className="btn" disabled={busy} onClick={()=>void api<{explanation:string}>(`/diagnosis-sessions/${id}/explanation`,{method:"POST"}).then(r=>setExplanation(r.explanation)).catch(e=>setErr(e.message))}>解释这些依据</button>
          {explanation&&<p className="small">{explanation}</p>}
        </div>
        <Attachments sessionId={session.id} onObservation={setText}/>
      </aside>

      {/* 交接摘要确认弹层 */}
      {draft && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }}>
          <div className="card" style={{ maxWidth: 560, maxHeight: "80vh", overflowY: "auto" }}>
            <h3>确认交接摘要</h3>
            <p className="muted small">志愿者将直接看到以下内容，不必再从头描述。请确认信息准确。</p>
            <p><strong>设备：</strong>{draft.device_desc}</p>
            <label>问题描述（可更正）</label><textarea value={draft.user_description} onChange={e=>setDraft({...draft,user_description:e.target.value})}/>
            <p><strong>已确认事实：</strong>{draft.confirmed_facts.join("；") || "无"}</p>
            <p><strong>已尝试步骤：</strong></p>
            <ul>{draft.tried_steps.map((s, i) => <li key={i}>{s.step} → {s.result}</li>)}</ul>
            <p><strong>待确认事项：</strong>{draft.unconfirmed_items.join("；") || "无"}</p>
            {draft.risk_notes.length > 0 && (
              <p className="badge badge-danger">风险提醒：{draft.risk_notes.join("、")}</p>
            )}
            <p><strong>转人工原因：</strong>{draft.handoff_reason}</p>
            <div className="option-row">
              <button className="btn btn-primary" disabled={busy} onClick={() => void confirmTicket()}>
                确认提交并选择预约时段
              </button>
              <button className="btn btn-ghost" onClick={() => setDraft(null)}>返回修改</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
