import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import DirectRepairRequest from "../components/DirectRepairRequest";
import { LoadingState, ErrorState, EmptyState } from "../components/AsyncState";
import { useResource } from "../hooks/useResource";
import { OUTCOME_LABEL, TICKET_STATUS_LABEL, type Ticket } from "../types";
const sessionLabels: Record<string, string> = {
  INTAKE: "接收中",
  CLARIFY: "确认环境",
  GUIDE: "排查中",
  VERIFY: "等待验证",
  PAUSED: "已暂停",
  RESOLVED: "已解决",
  HANDOFF: "转人工",
  CLOSED: "已结束",
};
const appointmentLabels: Record<string, string> = {
  HELD: "待确认",
  CONFIRMED: "已确认",
  CHECKED_IN: "已签到",
  CANCELLED: "已取消",
  COMPLETED: "已完成",
};
export default function MyTickets() {
  const tickets = useResource<Ticket[]>("/tickets/mine");
  const sessions = useResource<
    { id: string; state: string; symptom_text: string; updated_at: string }[]
  >("/diagnosis-sessions");
  return (
    <div>
      <PageHeader
        eyebrow="SERVICE CENTER / 我的服务"
        title="每一次服务，都有记录。"
        description="继续排查、查看维修进度，或直接预约人工义诊。"
        actions={
          <Link className="btn" to="/my/devices">
            管理我的设备
          </Link>
        }
      />
      <DirectRepairRequest />
      <div className="section-heading">
        <h2>
          我的工单{" "}
          <span className="count-badge">{tickets.data?.length || 0}</span>
        </h2>
        <button className="text-button" onClick={tickets.reload}>
          刷新工单
        </button>
      </div>
      {tickets.error ? (
        <ErrorState message={tickets.error} retry={tickets.reload} />
      ) : tickets.loading ? (
        <LoadingState label="正在读取工单…" />
      ) : !tickets.data?.length ? (
        <section className="card">
          <EmptyState
            title="还没有工单"
            description="需要人工协助时，可以使用上方表单预约维修。"
          />
        </section>
      ) : (
        tickets.data.map((ticket) => (
          <article className="card" key={ticket.id}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>
                <Link to={`/tickets/${ticket.id}`}>{ticket.title}</Link>
              </h3>
              <span
                className={`badge ${ticket.status === "CLOSED" ? "badge-ok" : ticket.status === "CANCELLED" ? "badge-neutral" : "badge-warn"}`}
              >
                {TICKET_STATUS_LABEL[ticket.status] || ticket.status}
              </span>
            </div>
            {ticket.outcome && (
              <span className="badge badge-neutral">
                {OUTCOME_LABEL[ticket.outcome]}
              </span>
            )}
            {ticket.active_appointment && (
              <p className="muted small" style={{ marginBottom: 6 }}>
                预约：
                {appointmentLabels[ticket.active_appointment.status] ||
                  ticket.active_appointment.status}{" "}
                · {ticket.active_appointment.slot?.service_date}{" "}
                {ticket.active_appointment.slot?.start_at}
              </p>
            )}
            <span className="muted small">
              创建于 {ticket.created_at?.slice(0, 16).replace("T", " ")}
            </span>
            <div className="option-row">
              <Link className="text-button" to={`/tickets/${ticket.id}`}>
                查看服务进度 →
              </Link>
            </div>
          </article>
        ))
      )}
      <div className="section-heading" style={{ marginTop: 30 }}>
        <h2>
          排障记录{" "}
          <span className="count-badge">{sessions.data?.length || 0}</span>
        </h2>
        <Link className="text-button" to="/help">
          开始新的排查 →
        </Link>
      </div>
      {sessions.error ? (
        <ErrorState message={sessions.error} retry={sessions.reload} />
      ) : sessions.loading ? (
        <LoadingState label="正在读取排障记录…" />
      ) : !sessions.data?.length ? (
        <section className="card">
          <EmptyState
            title="还没有排障记录"
            description="从问题求助开始，每一步的检查都会保存在这里。"
          />
        </section>
      ) : (
        sessions.data.map((session) => (
          <article className="card" key={session.id}>
            <div className="section-heading" style={{ marginBottom: 10 }}>
              <Link to={`/diagnosis/${session.id}`}>
                <strong>{session.symptom_text}</strong>
              </Link>
              <span className="badge badge-neutral">
                {sessionLabels[session.state] || session.state}
              </span>
            </div>
            <span className="muted small">
              更新于 {session.updated_at?.slice(0, 16).replace("T", " ")}
            </span>
          </article>
        ))
      )}
    </div>
  );
}
