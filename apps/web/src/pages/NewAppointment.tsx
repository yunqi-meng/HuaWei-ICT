import DirectRepairRequest from "../components/DirectRepairRequest";
import PageHeader from "../components/PageHeader";
import { LoadingState } from "../components/AsyncState";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, newClientMessageId } from "../api";
import { useAuth } from "../auth";
import type { Appointment, ServiceEvent, ServiceSlot, Ticket } from "../types";

function appointmentSummary(a: Appointment) {
  return (
    <>
      <p>
        时间：{a.slot.service_date} {a.slot.start_at} – {a.slot.end_at}
        （北京时间）
      </p>
      <p>
        地点：{a.slot.location?.name} {a.slot.location?.building_room}
      </p>
      <p className="small muted">{a.slot.location?.address_note}</p>
      <p className="small">{a.slot.bring_note}</p>
    </>
  );
}

export default function NewAppointment() {
  const [params] = useSearchParams();
  const ticketId = params.get("ticketId") ?? "";
  const rescheduling = params.get("reschedule") === "1";
  const { me, loading } = useAuth();
  const nav = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [slots, setSlots] = useState<ServiceSlot[]>([]);
  const [eventId, setEventId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [hold, setHold] = useState<Appointment | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [done, setDone] = useState<Appointment | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const requestKey = useRef({ signature: "", key: "" });

  function keyFor(signature: string) {
    if (requestKey.current.signature !== signature) {
      requestKey.current = { signature, key: newClientMessageId() };
    }
    return requestKey.current.key;
  }

  useEffect(() => {
    if (!me || !ticketId) return;
    let active = true;
    setReady(false);
    setHold(null);
    setDone(null);
    setEventId("");
    setSlotId("");
    Promise.all([
      api<Ticket>(`/tickets/${ticketId}`),
      api<ServiceEvent[]>("/service-events"),
    ])
      .then(([t, es]) => {
        if (!active) return;
        setTicket(t);
        setEvents(es);
        if (!t.can_manage) throw new Error("只能为自己的工单预约。");
        if (rescheduling) {
          if (t.active_appointment?.status !== "CONFIRMED")
            throw new Error("当前没有可改期的已确认预约。");
        } else if (t.active_appointment?.status === "HELD") {
          setHold(t.active_appointment);
        } else if (t.active_appointment?.status === "CONFIRMED") {
          setDone(t.active_appointment);
        } else if (
          t.active_appointment ||
          !["OPEN", "ACCEPTED"].includes(t.status)
        ) {
          throw new Error("当前工单状态不能预约。");
        }
        setErr("");
        setReady(true);
      })
      .catch((e) => {
        if (active) setErr((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [me, ticketId, rescheduling]);

  useEffect(() => {
    setSlotId("");
    setSlots([]);
    if (!eventId || hold) return;
    let active = true;
    setSlotsLoading(true);
    api<ServiceSlot[]>(`/service-slots?event_id=${eventId}`)
      .then((ss) => {
        if (active) setSlots(ss);
      })
      .catch((e) => {
        if (active) setErr((e as Error).message);
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [eventId, hold]);

  useEffect(() => {
    if (!hold) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hold]);

  const secondsLeft = hold?.hold_expires_at
    ? Math.max(0, Math.ceil((Date.parse(hold.hold_expires_at) - now) / 1000))
    : 0;

  async function reserve() {
    setBusy(true);
    setErr("");
    try {
      if (rescheduling) {
        const a = await api<Appointment>(
          `/appointments/${ticket!.active_appointment!.id}/reschedule`,
          {
            body: {
              new_slot_id: slotId,
              idempotency_key: keyFor(`move:${slotId}`),
            },
          },
        );
        setDone(a);
      } else {
        const a = await api<Appointment>("/appointment-holds", {
          body: {
            slot_id: slotId,
            ticket_id: ticketId,
            idempotency_key: keyFor(`hold:${slotId}`),
          },
        });
        if (a.status === "CONFIRMED") setDone(a);
        else if (a.status === "HELD") setHold(a);
        else {
          requestKey.current = { signature: "", key: "" };
          throw new Error("该保留已失效，请重新选择时段。");
        }
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!hold) return;
    setBusy(true);
    setErr("");
    try {
      setDone(
        await api<Appointment>(`/appointments/${hold.id}/confirm`, {
          body: {
            contact_name: contactName.trim(),
            contact_phone: contactPhone.trim(),
          },
        }),
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    if (!hold) return;
    setBusy(true);
    setErr("");
    try {
      if (secondsLeft > 0)
        await api(`/appointments/${hold.id}/cancel`, {
          body: { reason: "重新选择时段" },
        });
      setHold(null);
      setEventId("");
      setSlotId("");
      requestKey.current = { signature: "", key: "" };
      setEvents(await api<ServiceEvent[]>("/service-events"));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (!me)
    return (
      <div className="card">
        请先 <Link to="/login">登录</Link> 后预约。
      </div>
    );
  if (!ticketId)
    return (
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <PageHeader
          eyebrow="CAMPUS SERVICE / 校园义诊"
          title="预约校园电脑义诊"
          description="描述故障后选择活动时段，交给维修志愿者面对面检查。"
        />
        <DirectRepairRequest />
      </div>
    );
  if (!ready)
    return err ? (
      <div className="error-box" role="alert">
        {err}
      </div>
    ) : (
      <LoadingState label="正在加载预约信息…" />
    );
  if (done)
    return (
      <div className="card">
        <h2>{rescheduling ? "改期成功" : "预约已确认"}</h2>
        {appointmentSummary(done)}
        <div className="alert-ok">
          到场签到码：<strong>{done.checkin_code}</strong>
        </div>
        <p className="small muted">
          这是预约初诊服务的计划时段，不承诺所有问题当场修好。
        </p>
        <button
          className="btn btn-primary"
          onClick={() => nav(`/tickets/${ticketId}`)}
        >
          查看工单
        </button>
      </div>
    );

  return (
    <div>
      <PageHeader
        eyebrow="CAMPUS SERVICE / 校园义诊"
        title={rescheduling ? "更改预约时段" : "预约人工义诊"}
        description="确认活动地点与时间，保留名额后填写联系信息完成预约。"
      />
      {err && (
        <div className="error-box" role="alert">
          {err}
        </div>
      )}
      <div className="card">
        <h4>问题摘要</h4>
        <p>{ticket?.title}</p>
        {ticket?.handoff && (
          <details>
            <summary>查看排障交接摘要</summary>
            <p>
              已尝试：
              {ticket.handoff.tried_steps
                .map((s) => `${s.step}（${s.result}）`)
                .join("；") || "无"}
            </p>
            <p>待确认：{ticket.handoff.unconfirmed_items.join("；") || "无"}</p>
          </details>
        )}
      </div>
      {rescheduling && ticket?.active_appointment && (
        <div className="card">
          <h4>原预约</h4>
          {appointmentSummary(ticket.active_appointment)}
          <p className="alert-warn">
            确认新时段后才会释放原名额；改期失败时原预约仍然有效。
          </p>
        </div>
      )}
      {!hold && (
        <div className="card">
          <h4>选择活动与时段</h4>
          {events.length === 0 && <p>暂无开放活动，可返回工单等待协调。</p>}
          {events.map((e) => (
            <div key={e.id} className="card">
              <p>
                <strong>{e.title}</strong>{" "}
                <span className="badge badge-neutral">{e.service_date}</span>
              </p>
              <p>
                {e.location.name}（{e.location.building_room}）
              </p>
              <p className="small muted">
                {e.location.address_note} · {e.service_scope} · {e.bring_note}
              </p>
              <button
                className="btn"
                disabled={busy}
                aria-pressed={eventId === e.id}
                onClick={() => setEventId(e.id)}
              >
                {eventId === e.id ? "已选择" : "选择该活动"}
              </button>
            </div>
          ))}
          {slotsLoading && <p>正在查询可用名额…</p>}
          {eventId && !slotsLoading && slots.length === 0 && (
            <p>该活动没有可预约的时段，请选择其他活动。</p>
          )}
          <div className="slot-grid">
            {slots.map((s) => (
              <button
                key={s.id}
                className={`btn slot-btn ${slotId === s.id ? "selected" : ""}`}
                aria-pressed={slotId === s.id}
                disabled={
                  busy ||
                  s.remaining <= 0 ||
                  s.id === ticket?.active_appointment?.slot.id
                }
                onClick={() => setSlotId(s.id)}
              >
                {s.start_at} – {s.end_at}
                <br />
                <span className="small">
                  {s.id === ticket?.active_appointment?.slot.id
                    ? "当前预约"
                    : s.remaining > 0
                      ? `余 ${s.remaining}`
                      : "已满"}
                </span>
              </button>
            ))}
          </div>
          {slotId && (
            <div className="option-row">
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void reserve()}
              >
                {rescheduling ? "确认改为所选时段" : "保留该时段（5 分钟）"}
              </button>
            </div>
          )}
        </div>
      )}
      {hold && (
        <div className="card">
          <h4>已保留的时段</h4>
          {appointmentSummary(hold)}
          <p role="status">
            {secondsLeft > 0
              ? `剩余确认时间 ${Math.floor(secondsLeft / 60)} 分 ${secondsLeft % 60} 秒`
              : "保留已过期，请重新选择时段。"}
          </p>
          {secondsLeft > 0 && (
            <>
              <p className="small muted">
                手机号仅用于本次义诊联系。刷新页面可继续确认。
              </p>
              <label htmlFor="contact-name">联系人姓名</label>
              <input
                id="contact-name"
                autoComplete="name"
                maxLength={80}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
              <label htmlFor="contact-phone">联系手机号</label>
              <input
                id="contact-phone"
                type="tel"
                autoComplete="tel"
                maxLength={30}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </>
          )}
          <div className="option-row">
            {secondsLeft > 0 && (
              <button
                className="btn btn-primary"
                disabled={
                  busy || !contactName.trim() || contactPhone.trim().length < 5
                }
                onClick={() => void confirm()}
              >
                确认预约
              </button>
            )}
            <button
              className="btn"
              disabled={busy}
              onClick={() => void release()}
            >
              {secondsLeft > 0 ? "释放保留并重新选择" : "重新选择时段"}
            </button>
          </div>
        </div>
      )}
      <Link to={`/tickets/${ticketId}`}>返回工单</Link>
    </div>
  );
}
