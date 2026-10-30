import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, newClientMessageId } from "../api";
import { useAuth } from "../auth";
import DeviceSelect from "../components/DeviceSelect";
import { OUTCOME_LABEL, TICKET_STATUS_LABEL, type Ticket } from "../types";

export default function MyTickets() {
  const { me, loading } = useAuth();
  const nav = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sessions, setSessions] = useState<{ id: string; state: string; symptom_text: string; updated_at: string }[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [deviceId,setDeviceId]=useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef({ signature: "", key: "" });

  function refresh() {
    api<Ticket[]>("/tickets/mine").then(setTickets).catch(() => undefined);
    api<typeof sessions>("/diagnosis-sessions").then(setSessions).catch(() => undefined);
  }
  useEffect(refresh, []);

  if (!loading && !me) return <div className="card"><p>请先 <Link to="/login">登录</Link>。</p></div>;

  async function createDirectTicket() {
    if (title.trim().length < 2 || busy) return;
    const signature = JSON.stringify([title.trim(), desc.trim(),deviceId]);
    if (request.current.signature !== signature) {
      request.current = { signature, key: newClientMessageId() };
    }
    setBusy(true);
    setErr("");
    try {
      const t = await api<Ticket>("/tickets", {
        body: { title: title.trim(), description: desc.trim(),
                device_id:deviceId||null,
                idempotency_key: request.current.key },
      });
      nav(`/appointments/new?ticketId=${t.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>我的服务</h2>

      <div className="card">
        <h4>直接预约人工（不经过智能排障）</h4>
        <DeviceSelect value={deviceId} onChange={setDeviceId}/>
        <input placeholder="一句话描述问题，如：电脑无法开机" value={title}
               onChange={(e) => setTitle(e.target.value)} />
        <textarea rows={2} placeholder="补充说明（可选）" value={desc}
                  onChange={(e) => setDesc(e.target.value)} style={{ marginTop: 8 }} />
        {err && <div className="error-box">{err}</div>}
        <div className="option-row">
          <button className="btn btn-primary" disabled={busy || title.trim().length < 2}
                  onClick={() => void createDirectTicket()}>
            提交并预约时段
          </button>
        </div>
      </div>

      <h3>我的工单</h3>
      {tickets.map((t) => (
        <div className="card" key={t.id}>
          <Link to={`/tickets/${t.id}`}><strong>{t.title}</strong></Link>{" "}
          <span className={`badge ${t.status === "CLOSED" ? "badge-ok" : t.status === "CANCELLED" ? "badge-neutral" : "badge-warn"}`}>
            {TICKET_STATUS_LABEL[t.status] ?? t.status}
          </span>
          {t.outcome && <span className="badge badge-neutral">{OUTCOME_LABEL[t.outcome]}</span>}
          {t.active_appointment && (
            <p className="small muted">预约状态：{t.active_appointment.status}</p>
          )}
          <p className="small muted">{t.created_at?.slice(0, 16).replace("T", " ")}</p>
        </div>
      ))}
      {tickets.length === 0 && <p className="muted">还没有工单。</p>}

      <h3>排障会话</h3>
      {sessions.map((s) => (
        <div className="card" key={s.id}>
          <Link to={`/diagnosis/${s.id}`}>{s.symptom_text}</Link>{" "}
          <span className="badge badge-neutral">{s.state}</span>
          <p className="small muted">更新于 {s.updated_at?.slice(0, 16).replace("T", " ")}</p>
        </div>
      ))}
      {sessions.length === 0 && <p className="muted">还没有排障记录。</p>}
    </div>
  );
}
