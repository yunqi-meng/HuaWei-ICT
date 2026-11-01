import { useResource } from "../hooks/useResource";
import { LoadingState, ErrorState, EmptyState } from "../components/AsyncState";
import PageHeader from "../components/PageHeader";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import TicketControls from "../components/TicketControls";
import Attachments from "../components/Attachments";
import { TICKET_STATUS_LABEL, type Ticket } from "../types";

/** 维修工作台：队列、签到核销、检查与维修记录、提交结果待验收（方案 6 节）。 */
export default function StaffWorkbench() {
  const { me, loading, hasRole } = useAuth();
  const queueResource = useResource<Ticket[]>("/staff/tickets");
  const queue = queueResource.data || [];
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState("");
  const openRequest = useRef<AbortController | null>(null);
  useEffect(() => () => openRequest.current?.abort(), []);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [checkinId, setCheckinId] = useState("");
  const [checkinCode, setCheckinCode] = useState("");
  const [record, setRecord] = useState({
    check_items: "",
    cause: "",
    action_taken: "",
    verification: "",
    conclusion: "fixed",
    advice: "",
    submit_result: false,
  });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  function refresh() {
    queueResource.reload();
  }

  if (!loading && !hasRole("staff", "admin")) {
    return <div className="error-box">需要维修志愿者或管理员权限。</div>;
  }

  async function checkIn() {
    if (busy) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api(`/staff/appointments/${checkinId}/check-in`, {
        body: { code: checkinCode.trim() },
      });
      setMsg("签到成功，工单已进入处理中");
      setCheckinId("");
      setCheckinCode("");
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function open(t: Ticket) {
    openRequest.current?.abort();
    const controller = new AbortController();
    openRequest.current = controller;
    setOpening(t.id);
    setErr("");
    try {
      const detail = await api<Ticket>(`/tickets/${t.id}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (selected?.id !== detail.id)
        setRecord({
          check_items: "",
          cause: "",
          action_taken: "",
          verification: "",
          conclusion: "fixed",
          advice: "",
          submit_result: false,
        });
      setSelected(detail);
      setCheckinId(
        detail.active_appointment?.status === "CONFIRMED"
          ? detail.active_appointment.id
          : "",
      );
    } catch (e) {
      if (!controller.signal.aborted) setErr((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setOpening("");
    }
  }

  async function submitRecord() {
    if (!selected || busy) return;
    setBusy(true);
    setErr("");
    try {
      await api(`/staff/tickets/${selected.id}/repair-records`, {
        body: record,
      });
      setMsg(
        record.submit_result ? "维修结果已提交，等待用户验收" : "记录已保存",
      );
      setRecord({
        ...record,
        check_items: "",
        cause: "",
        action_taken: "",
        verification: "",
        advice: "",
      });
      refresh();
      open(selected);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="REPAIR DESK / 维修工作台"
        title="维修工作台"
        description="处理工单、核销到场签到，记录检查过程与维修结果。"
      />
      {msg && <div className="alert-ok">{msg}</div>}
      {err && (
        <div className="error-box" role="alert">
          {err}
        </div>
      )}

      <div className="card">
        <h4>到场签到核销</h4>
        <div className="staff-checkin" style={{ display: "flex", gap: 10 }}>
          <input
            placeholder="选择工单后自动填入预约编号"
            aria-label="预约编号"
            value={checkinId}
            onChange={(e) => setCheckinId(e.target.value)}
          />
          <input
            placeholder="用户出示的签到码"
            aria-label="用户出示的签到码"
            value={checkinCode}
            onChange={(e) => setCheckinCode(e.target.value)}
            style={{ maxWidth: 220 }}
          />
          <button
            className="btn btn-primary"
            disabled={busy || !checkinId || !checkinCode}
            onClick={() => void checkIn()}
          >
            核销签到
          </button>
        </div>
      </div>

      <div className={`staff-layout ${selected ? "has-selected" : ""}`}>
        <div>
          <h3>工单队列</h3>
          {queueResource.error && (
            <ErrorState
              message={queueResource.error}
              retry={queueResource.reload}
            />
          )}
          {queueResource.loading && <LoadingState label="正在加载工单队列…" />}
          {queue.map((t) => (
            <div className="card" key={t.id}>
              <button
                className="btn btn-ghost"
                disabled={busy || opening === t.id}
                aria-pressed={selected?.id === t.id}
                onClick={() => void open(t)}
              >
                <strong>{opening === t.id ? "正在加载…" : t.title}</strong>
              </button>{" "}
              <span className="badge badge-warn">
                {TICKET_STATUS_LABEL[t.status]}
              </span>{" "}
              {t.priority === "high" && (
                <span className="badge badge-danger">高优先级</span>
              )}
              <p className="small muted">
                {t.created_at?.slice(0, 16).replace("T", " ")} · 负责人：
                {t.assignee_id ? "已分配" : "未分配"}
              </p>
            </div>
          ))}
          {!queueResource.loading &&
            !queueResource.error &&
            queue.length === 0 && (
              <EmptyState
                title="暂无待处理工单"
                description="新的工单分配后会在这里显示。"
              />
            )}
        </div>

        {selected && (
          <div>
            <h3>工单详情</h3>
            <div className="card">
              <p>
                <strong>{selected.title}</strong>
              </p>
              {selected.handoff && (
                <>
                  <p className="small">
                    <strong>用户描述：</strong>
                    {selected.handoff.user_description}
                  </p>
                  <p className="small">
                    <strong>设备：</strong>
                    {selected.handoff.device_desc}
                  </p>
                  <div className="alert-warn">
                    <strong>用户已做过（不要重复询问）：</strong>
                    <ul className="small">
                      {selected.handoff.tried_steps.map((s, i) => (
                        <li key={i}>
                          {s.step} → {s.result}
                        </li>
                      ))}
                      {selected.handoff.tried_steps.length === 0 && (
                        <li>无（直接预约）</li>
                      )}
                    </ul>
                  </div>
                  <p className="small">
                    <strong>待确认：</strong>
                    {selected.handoff.unconfirmed_items.join("；") || "无"}
                  </p>
                  {selected.handoff.risk_notes.length > 0 && (
                    <p className="badge badge-danger">
                      风险：{selected.handoff.risk_notes.join("、")}
                    </p>
                  )}
                </>
              )}
              <Link className="small" to={`/tickets/${selected.id}`}>
                查看完整时间线 →
              </Link>
            </div>

            <div className="card">
              <h4>添加维修记录</h4>
              <label htmlFor="staffworkbench-field-1">检查项目与观察结果</label>
              <textarea
                id="staffworkbench-field-1"
                rows={2}
                value={record.check_items}
                onChange={(e) =>
                  setRecord({ ...record, check_items: e.target.value })
                }
              />
              <label htmlFor="staffworkbench-field-2">
                判定原因（允许“尚未确认”）
              </label>
              <input
                id="staffworkbench-field-2"
                value={record.cause}
                onChange={(e) =>
                  setRecord({ ...record, cause: e.target.value })
                }
              />
              <label htmlFor="staffworkbench-field-3">执行处理</label>
              <textarea
                id="staffworkbench-field-3"
                rows={2}
                value={record.action_taken}
                onChange={(e) =>
                  setRecord({ ...record, action_taken: e.target.value })
                }
              />
              <label htmlFor="staffworkbench-field-4">验证方法</label>
              <input
                id="staffworkbench-field-4"
                value={record.verification}
                onChange={(e) =>
                  setRecord({ ...record, verification: e.target.value })
                }
              />
              <label htmlFor="staffworkbench-field-5">结论</label>
              <select
                id="staffworkbench-field-5"
                value={record.conclusion}
                onChange={(e) =>
                  setRecord({ ...record, conclusion: e.target.value })
                }
              >
                <option value="fixed">已修复</option>
                <option value="partially_fixed">部分修复</option>
                <option value="unresolved">未解决</option>
                <option value="referred">转专业机构</option>
                <option value="in_progress">处理中（不提交结果）</option>
              </select>
              <label htmlFor="staffworkbench-field-6">后续建议</label>
              <input
                id="staffworkbench-field-6"
                value={record.advice}
                onChange={(e) =>
                  setRecord({ ...record, advice: e.target.value })
                }
              />
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={record.submit_result}
                  onChange={(e) =>
                    setRecord({ ...record, submit_result: e.target.checked })
                  }
                />
                作为维修结果提交（进入用户验收）
              </label>
              <div className="option-row">
                <button
                  className="btn btn-primary"
                  disabled={
                    busy ||
                    Boolean(opening) ||
                    !selected.can_work ||
                    !record.check_items.trim()
                  }
                  onClick={() => void submitRecord()}
                >
                  保存记录
                </button>
              </div>
            </div>
            <Attachments
              ticketId={selected.id}
              canUpload={Boolean(selected.can_work)}
            />
            <TicketControls
              ticket={selected}
              onRefresh={() => {
                refresh();
                void open(selected);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
