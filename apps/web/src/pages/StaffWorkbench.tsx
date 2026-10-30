import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import TicketControls from "../components/TicketControls";
import Attachments from "../components/Attachments";
import { TICKET_STATUS_LABEL, type Ticket } from "../types";

/** 维修工作台：队列、签到核销、检查与维修记录、提交结果待验收（方案 6 节）。 */
export default function StaffWorkbench() {
  const { me, loading, hasRole } = useAuth();
  const [queue, setQueue] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [checkinId, setCheckinId] = useState("");
  const [checkinCode, setCheckinCode] = useState("");
  const [record, setRecord] = useState({
    check_items: "", cause: "", action_taken: "", verification: "",
    conclusion: "fixed", advice: "", submit_result: false,
  });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  function refresh() {
    api<Ticket[]>("/staff/tickets").then(setQueue).catch(() => setQueue([]));
  }
  useEffect(() => {
    if (me) refresh();
  }, [me]);

  if (!loading && !hasRole("staff", "admin")) {
    return <div className="error-box">需要维修志愿者或管理员权限。</div>;
  }

  async function checkIn() {
    setErr("");
    setMsg("");
    try {
      await api(`/staff/appointments/${checkinId}/check-in`, { body: { code: checkinCode.trim() } });
      setMsg("签到成功，工单已进入处理中");
      setCheckinId("");
      setCheckinCode("");
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function open(t: Ticket) {
    try {
      const detail = await api<Ticket>(`/tickets/${t.id}`);
      setSelected(detail);
      setCheckinId(detail.active_appointment?.status === "CONFIRMED" ? detail.active_appointment.id : "");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function submitRecord() {
    if (!selected) return;
    setErr("");
    try {
      await api(`/staff/tickets/${selected.id}/repair-records`, { body: record });
      setMsg(record.submit_result ? "维修结果已提交，等待用户验收" : "记录已保存");
      setRecord({ ...record, check_items: "", cause: "", action_taken: "", verification: "", advice: "" });
      refresh();
      open(selected);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div>
      <h2>维修工作台</h2>
      {msg && <div className="alert-ok">{msg}</div>}
      {err && <div className="error-box">{err}</div>}

      <div className="card">
        <h4>到场签到核销</h4>
        <div style={{ display: "flex", gap: 10 }}>
          <input placeholder="选择工单后自动填入预约编号" aria-label="预约编号" value={checkinId}
                 onChange={(e) => setCheckinId(e.target.value)} />
          <input placeholder="用户出示的签到码" aria-label="用户出示的签到码" value={checkinCode}
                 onChange={(e) => setCheckinCode(e.target.value)} style={{ maxWidth: 220 }} />
          <button className="btn btn-primary" disabled={!checkinId || !checkinCode}
                  onClick={() => void checkIn()}>
            核销签到
          </button>
        </div>
      </div>

      <div className={`staff-layout ${selected ? "has-selected" : ""}`}>
        <div>
          <h3>工单队列</h3>
          {queue.map((t) => (
            <div className="card" key={t.id}>
              <button className="btn btn-ghost" onClick={() => void open(t)}>
                <strong>{t.title}</strong>
              </button>{" "}
              <span className="badge badge-warn">{TICKET_STATUS_LABEL[t.status]}</span>{" "}
              {t.priority === "high" && <span className="badge badge-danger">高优先级</span>}
              <p className="small muted">{t.created_at?.slice(0, 16).replace("T", " ")} · 负责人：{t.assignee_id ? "已分配" : "未分配"}</p>
            </div>
          ))}
          {queue.length === 0 && <p className="muted">暂无待处理工单。</p>}
        </div>

        {selected && (
          <div>
            <h3>工单详情</h3>
            <div className="card">
              <p><strong>{selected.title}</strong></p>
              {selected.handoff && (
                <>
                  <p className="small"><strong>用户描述：</strong>{selected.handoff.user_description}</p>
                  <p className="small"><strong>设备：</strong>{selected.handoff.device_desc}</p>
                  <div className="alert-warn">
                    <strong>用户已做过（不要重复询问）：</strong>
                    <ul className="small">
                      {selected.handoff.tried_steps.map((s, i) => (
                        <li key={i}>{s.step} → {s.result}</li>
                      ))}
                      {selected.handoff.tried_steps.length === 0 && <li>无（直接预约）</li>}
                    </ul>
                  </div>
                  <p className="small"><strong>待确认：</strong>{selected.handoff.unconfirmed_items.join("；") || "无"}</p>
                  {selected.handoff.risk_notes.length > 0 && (
                    <p className="badge badge-danger">风险：{selected.handoff.risk_notes.join("、")}</p>
                  )}
                </>
              )}
              <Link className="small" to={`/tickets/${selected.id}`}>查看完整时间线 →</Link>
            </div>

            <div className="card">
              <h4>添加维修记录</h4>
              <label>检查项目与观察结果</label>
              <textarea rows={2} value={record.check_items}
                        onChange={(e) => setRecord({ ...record, check_items: e.target.value })} />
              <label>判定原因（允许“尚未确认”）</label>
              <input value={record.cause} onChange={(e) => setRecord({ ...record, cause: e.target.value })} />
              <label>执行处理</label>
              <textarea rows={2} value={record.action_taken}
                        onChange={(e) => setRecord({ ...record, action_taken: e.target.value })} />
              <label>验证方法</label>
              <input value={record.verification}
                     onChange={(e) => setRecord({ ...record, verification: e.target.value })} />
              <label>结论</label>
              <select value={record.conclusion}
                      onChange={(e) => setRecord({ ...record, conclusion: e.target.value })}>
                <option value="fixed">已修复</option>
                <option value="partially_fixed">部分修复</option>
                <option value="unresolved">未解决</option>
                <option value="referred">转专业机构</option>
                <option value="in_progress">处理中（不提交结果）</option>
              </select>
              <label>后续建议</label>
              <input value={record.advice} onChange={(e) => setRecord({ ...record, advice: e.target.value })} />
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" style={{ width: "auto" }}
                       checked={record.submit_result}
                       onChange={(e) => setRecord({ ...record, submit_result: e.target.checked })} />
                作为维修结果提交（进入用户验收）
              </label>
              <div className="option-row">
                <button className="btn btn-primary" onClick={() => void submitRecord()}>
                  保存记录
                </button>
              </div>
            </div>
            <Attachments ticketId={selected.id} canUpload={Boolean(selected.can_work)}/>
            <TicketControls ticket={selected} onRefresh={()=>{refresh();void open(selected);}}/>
          </div>
        )}
      </div>
    </div>
  );
}
