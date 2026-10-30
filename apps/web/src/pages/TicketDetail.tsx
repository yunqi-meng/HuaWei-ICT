import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Attachments from "../components/Attachments";
import TicketControls from "../components/TicketControls";
import { OUTCOME_LABEL, TICKET_STATUS_LABEL, type Ticket } from "../types";

export default function TicketDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    api<Ticket>(`/tickets/${id}`).then(setTicket).catch((e) => setErr((e as Error).message));
  }
  useEffect(refresh, [id]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await fn();
      setMsg(okMsg);
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (err && !ticket) return <div className="error-box">{err}</div>;
  if (!ticket) return <p className="muted">加载中…</p>;

  const appt = ticket.active_appointment;

  return (
    <div>
      <h2>{ticket.title}</h2>
      <p>
        <span className={`badge ${ticket.status === "CLOSED" ? "badge-ok" : "badge-warn"}`}>
          {TICKET_STATUS_LABEL[ticket.status] ?? ticket.status}
        </span>{" "}
        {ticket.outcome && (
          <span className="badge badge-neutral">
            {OUTCOME_LABEL[ticket.outcome]}
            {ticket.outcome_confirmed_by_user === "yes" ? "（用户已确认）" : "（未获用户确认）"}
          </span>
        )}
      </p>
      {ticket.risk_flags.length > 0 && (
        <div className="alert-danger">风险提醒：{ticket.risk_flags.join("、")}</div>
      )}
      {msg && <div className="alert-ok">{msg}</div>}
      {err && <div className="error-box">{err}</div>}

      {ticket.handoff && (
        <div className="card">
          <h4>排障交接摘要</h4>
          <p className="small"><strong>设备：</strong>{ticket.handoff.device_desc}</p>
          <p className="small"><strong>描述：</strong>{ticket.handoff.user_description}</p>
          <p className="small"><strong>已尝试：</strong>
            {ticket.handoff.tried_steps.map((s) => `${s.step}(${s.result})`).join("；") || "无"}</p>
          <p className="small"><strong>待确认：</strong>{ticket.handoff.unconfirmed_items.join("；") || "无"}</p>
          {ticket.handoff.hypotheses.length > 0 && (
            <p className="small muted">待验证假设（维修员判断）：{ticket.handoff.hypotheses.join("；")}</p>
          )}
          {ticket.session_id && ticket.can_manage && <Link className="small" to={`/diagnosis/${ticket.session_id}`}>查看完整会话 →</Link>}
        </div>
      )}
      <Attachments ticketId={ticket.id} canUpload={ticket.can_manage}/>
      <TicketControls ticket={ticket} onRefresh={refresh}/>

      <div className="card">
        <h4>预约</h4>
        {appt ? (
          <>
            <p>状态：{{ HELD: "待确认", CONFIRMED: "已确认", CHECKED_IN: "已签到" }[appt.status] ?? appt.status}</p>
            <p>时间：{appt.slot.service_date} {appt.slot.start_at} – {appt.slot.end_at}（北京时间）</p>
            <p>地点：{appt.slot.location?.name} {appt.slot.location?.building_room}</p>
            <p className="small muted">{appt.slot.location?.address_note} {appt.slot.bring_note}</p>
            {appt.checkin_code && (
              <div className="alert-ok">签到码：<strong style={{ fontSize: 18 }}>{appt.checkin_code}</strong>（到场出示）</div>
            )}
            {ticket.can_manage && appt.status === "HELD" && (
              <button className="btn btn-primary" disabled={busy}
                      onClick={() => nav(`/appointments/new?ticketId=${ticket.id}`)}>
                继续确认预约
              </button>
            )}
            {ticket.can_manage && appt.status === "CONFIRMED" && (
              <button className="btn" disabled={busy}
                      onClick={() => nav(`/appointments/new?ticketId=${ticket.id}&reschedule=1`)}>
                更改预约时段
              </button>
            )}
            {ticket.can_manage && (appt.status === "HELD" || appt.status === "CONFIRMED") && (
              <button className="btn btn-danger" disabled={busy}
                      onClick={() => void act(
                        () => api(`/appointments/${appt.id}/cancel`, { body: { reason: "用户取消" } }),
                        "预约已取消，名额已释放")}>
                取消本次预约
              </button>
            )}
          </>
        ) : (
          ticket.can_manage && (ticket.status === "OPEN" || ticket.status === "ACCEPTED") && (
            <button className="btn btn-primary" onClick={() => nav(`/appointments/new?ticketId=${ticket.id}`)}>
              选择时段预约
            </button>
          )
        )}
      </div>

      {ticket.can_manage && ticket.status === "AWAITING_VERIFICATION" && (
        <div className="card">
          <h4>维修结果验收</h4>
          <p>请核对下方维修记录后确认；结单会保留记录中的修复、未解决或转介等结论。</p>
          <div className="option-row">
            <button className="btn btn-primary" disabled={busy}
                    onClick={() => void act(
                      () => api(`/tickets/${ticket.id}/verification`, { body: { fixed: true, comment: "" } }),
                      "已确认维修结果，工单结单")}>
              确认上述维修结果并结单
            </button>
            <button className="btn" disabled={busy}
                    onClick={() => void act(
                      () => api(`/tickets/${ticket.id}/verification`, { body: { fixed: false, comment: "问题仍在" } }),
                      "已反馈未修复，工单回到处理中")}>
              对结果有疑问，继续处理
            </button>
          </div>
        </div>
      )}

      {ticket.can_manage && ticket.status === "CLOSED" && (
        <div className="card">
          <h4>同一问题复发？</h4>
          <button className="btn" disabled={busy}
                  onClick={() => void act(
                    () => api(`/tickets/${ticket.id}/reopen`, { body: { reason: "同一问题复发" } }),
                    "已申请复开，等待受理")}>
            申请复开本工单
          </button>
        </div>
      )}

      {ticket.can_manage && (ticket.status === "OPEN" || ticket.status === "ACCEPTED") && (
        <div className="card">
          <button className="btn btn-danger" disabled={busy}
                  onClick={() => void act(
                    () => api(`/tickets/${ticket.id}/cancel`, { method: "POST" }),
                    "工单已取消")}>
            取消工单
          </button>
        </div>
      )}

      {ticket.repair_records && ticket.repair_records.length > 0 && (
        <div className="card">
          <h4>维修记录</h4>
          {ticket.repair_records.map((r) => (
            <div key={r.id} className="card" style={{ background: "#fafbfc" }}>
              <p className="small"><strong>检查：</strong>{r.check_items}</p>
              <p className="small"><strong>判定原因：</strong>{r.cause}</p>
              <p className="small"><strong>处理：</strong>{r.action_taken}</p>
              <p className="small"><strong>验证：</strong>{r.verification}</p>
              <p className="small"><strong>结论：</strong>{OUTCOME_LABEL[r.conclusion] ?? r.conclusion}
                {r.is_result_submission === "yes" && "（维修结果）"}</p>
              {r.advice && <p className="small"><strong>建议：</strong>{r.advice}</p>}
              <p className="small muted">{r.at?.slice(0, 16).replace("T", " ")}</p>
            </div>
          ))}
        </div>
      )}

      {ticket.events && (
        <div className="card">
          <h4>时间线</h4>
          <div className="timeline">
            {ticket.events.map((e, i) => (
              <div className="event" key={i}>
                <div className="time">{e.at?.slice(0, 19).replace("T", " ")}</div>
                <div>{e.type}{e.from && e.to ? `：${TICKET_STATUS_LABEL[e.from] ?? e.from} → ${TICKET_STATUS_LABEL[e.to] ?? e.to}` : ""}</div>
                {typeof e.detail.comment==="string"&&<p>{e.detail.comment}</p>}
                {typeof e.detail.reason==="string"&&<p>{e.detail.reason}</p>}
                {typeof e.detail.appearance==="string"&&<p>设备外观：{e.detail.appearance}</p>}
                {typeof e.detail.accessories==="string"&&<p>配件：{e.detail.accessories}</p>}
                {typeof e.detail.note==="string"&&<p>{e.detail.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
