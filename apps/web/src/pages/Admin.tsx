import { useResource } from "../hooks/useResource";
import { ErrorState, LoadingState, EmptyState } from "../components/AsyncState";
import PageHeader from "../components/PageHeader";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { TICKET_STATUS_LABEL, type Ticket } from "../types";

interface Metrics {
  sessions_total: number;
  reviews: { n: number; average: number | null };
  tickets_by_status: Record<string, number>;
  tickets_fixed_user_confirmed: number;
  sessions_handoff: number;
  sessions_resolved: number;
  note: string;
}

/** 运营后台：指标概览、工单中心与派单（方案 6 节 MVP 子集）。 */
export default function Admin() {
  const { me, loading, hasRole } = useAuth();
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(""),
    [dateTo, setDateTo] = useState("");
  const [assignTarget, setAssignTarget] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const dates = new URLSearchParams();
  if (dateFrom) dates.set("date_from", dateFrom);
  if (dateTo) dates.set("date_to", dateTo);
  const invalidDates = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const metricResource = useResource<Metrics>(
    invalidDates ? null : `/admin/metrics?${dates}`,
  );
  const ticketResource = useResource<Ticket[]>(
    `/admin/tickets${statusFilter ? `?status=${statusFilter}` : ""}`,
  );
  const staffResource =
    useResource<{ id: string; display_name: string }[]>("/admin/staff-list");
  const metrics = metricResource.data;
  const tickets = ticketResource.data || [];
  const staff = staffResource.data || [];
  function refresh() {
    metricResource.reload();
    ticketResource.reload();
    staffResource.reload();
  }

  if (!loading && !hasRole("admin", "dispatcher")) {
    return <div className="error-box">需要管理员权限。</div>;
  }

  async function assign(t: Ticket) {
    const assignee = assignTarget[t.id];
    if (!assignee || busy) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api(`/admin/tickets/${t.id}/assign`, {
        body: { assignee_id: assignee, version: t.version },
      });
      setMsg(`已派单：${t.title}`);
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="OPERATIONS / 运营后台"
        title="运营概览"
        description="关注服务进度与处理结果，协调工单和维修人员。"
      />
      <div className="form-grid">
        <div>
          <label htmlFor="stats-from">统计开始日期（北京时间）</label>
          <input
            id="stats-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="stats-to">统计结束日期</label>
          <input
            id="stats-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>
      {msg && <div className="alert-ok">{msg}</div>}
      {err && (
        <div className="error-box" role="alert">
          {err}
        </div>
      )}

      {invalidDates && <ErrorState message="统计结束日期不能早于开始日期。" />}
      {metricResource.error && (
        <ErrorState
          message={metricResource.error}
          retry={metricResource.reload}
        />
      )}
      {metricResource.loading && <LoadingState label="正在加载统计…" />}
      {metrics && (
        <div className="card">
          <h4>运营概览</h4>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {Object.entries(metrics.tickets_by_status).map(([s, n]) => (
              <div key={s}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{n}</div>
                <div className="small muted">{TICKET_STATUS_LABEL[s] ?? s}</div>
              </div>
            ))}
            <div>
              <div
                style={{ fontSize: 24, fontWeight: 700, color: "var(--ok)" }}
              >
                {metrics.tickets_fixed_user_confirmed}
              </div>
              <div className="small muted">用户确认修复</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {metrics.sessions_resolved}
              </div>
              <div className="small muted">自助解决会话</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {metrics.sessions_handoff}
              </div>
              <div className="small muted">转人工会话</div>
            </div>
          </div>
          <p className="small muted">{metrics.note}</p>
          <p className="small">
            开始排障会话数：{metrics.sessions_total}；服务评价：
            {metrics.reviews.n} 人，平均{" "}
            {metrics.reviews.average?.toFixed(1) ?? "暂无"} / 5 分。
          </p>
        </div>
      )}

      <div className="card">
        <h4>工单中心</h4>
        <select
          aria-label="工单状态筛选"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ maxWidth: 220 }}
        >
          <option value="">全部状态</option>
          {Object.entries(TICKET_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {ticketResource.error && (
        <ErrorState
          message={ticketResource.error}
          retry={ticketResource.reload}
        />
      )}
      {staffResource.error && (
        <ErrorState
          message={staffResource.error}
          retry={staffResource.reload}
        />
      )}
      {ticketResource.loading && <LoadingState label="正在加载工单…" />}
      {!ticketResource.error && !ticketResource.loading && !tickets.length && (
        <div className="card">
          <EmptyState
            title="当前没有匹配的工单"
            description="切换状态筛选，或等待新工单提交。"
          />
        </div>
      )}
      {tickets.map((t) => (
        <div className="card" key={t.id}>
          <p>
            <Link to={`/tickets/${t.id}`}>
              <strong>{t.title}</strong>
            </Link>{" "}
            <span className="badge badge-warn">
              {TICKET_STATUS_LABEL[t.status]}
            </span>{" "}
            {t.priority === "high" && (
              <span className="badge badge-danger">高优先级</span>
            )}{" "}
            {t.session_id && (
              <span className="badge badge-neutral">含排障摘要</span>
            )}
          </p>
          <p className="small muted">
            {t.created_at?.slice(0, 16).replace("T", " ")} · 版本 v{t.version}
            {t.assignee_id ? ` · 已分配` : " · 未分配"}
          </p>
          {t.status === "OPEN" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <select
                aria-label={`为 ${t.title} 选择维修人员`}
                disabled={busy}
                style={{ maxWidth: 240 }}
                value={assignTarget[t.id] ?? ""}
                onChange={(e) =>
                  setAssignTarget({ ...assignTarget, [t.id]: e.target.value })
                }
              >
                <option value="">选择维修志愿者</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                disabled={busy || !assignTarget[t.id]}
                onClick={() => void assign(t)}
              >
                派单
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
