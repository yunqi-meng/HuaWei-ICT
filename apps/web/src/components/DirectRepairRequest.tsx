import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, newClientMessageId } from "../api";
import DeviceSelect from "./DeviceSelect";
import Icon from "./Icon";
import { ErrorState } from "./AsyncState";

export default function DirectRepairRequest() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const request = useRef({ signature: "", key: "" });
  async function submit() {
    if (pending.current || title.trim().length < 2) return;
    const signature = JSON.stringify([
      title.trim(),
      description.trim(),
      deviceId,
    ]);
    if (request.current.signature !== signature)
      request.current = { signature, key: newClientMessageId() };
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const ticket = await api<{ id: string }>("/tickets", {
        body: {
          title: title.trim(),
          description: description.trim(),
          device_id: deviceId || null,
          idempotency_key: request.current.key,
        },
      });
      navigate(`/appointments/new?ticketId=${ticket.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <h2>预约人工维修</h2>
          <p className="muted small">
            先告诉我们故障情况，再选择活动与预约时段。
          </p>
        </div>
        <span className="service-icon">
          <Icon name="calendar" size={22} />
        </span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <DeviceSelect value={deviceId} onChange={setDeviceId} />
        <label htmlFor="repair-title">一句话描述问题</label>
        <input
          id="repair-title"
          placeholder="例如：电脑无法开机"
          required
          minLength={2}
          maxLength={200}
          disabled={busy}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <label htmlFor="repair-description">补充说明（选填）</label>
        <textarea
          id="repair-description"
          placeholder="出现时间、报错信息，以及你已尝试的操作"
          maxLength={2000}
          rows={3}
          disabled={busy}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        {error && <ErrorState message={error} />}
        <div className="option-row">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || title.trim().length < 2}
          >
            {busy ? "正在提交…" : "提交并选择预约时段"}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </form>
    </section>
  );
}
