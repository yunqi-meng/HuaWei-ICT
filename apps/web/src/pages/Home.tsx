import { useState } from "react";
import { Link, useNavigate,useLocation } from "react-router-dom";
import DeviceSelect from "../components/DeviceSelect";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Guide, ServiceEvent } from "../types";
import { useEffect } from "react";

const EXAMPLES = ["电脑很卡", "Wi-Fi 连上却不能上网", "耳机有声音，扬声器没声音"];

export default function Home() {
  const { me } = useAuth();
  const nav = useNavigate();
  const loc=useLocation();
  const [text, setText] = useState((loc.state as {symptom?:string})?.symptom||"");
  const [deviceId,setDeviceId]=useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [events, setEvents] = useState<ServiceEvent[]>([]);

  useEffect(() => {
    api<Guide[]>("/guides").then(setGuides).catch(() => undefined);
    api<ServiceEvent[]>("/service-events").then(setEvents).catch(() => undefined);
  }, []);

  async function start() {
    if (!text.trim()) return;
    if (!me) {
      nav("/login", { state: { back: "/", symptom: text } });
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const s = await api<{ id: string }>("/diagnosis-sessions", {
        body: { symptom_text: text.trim(),device_id:deviceId||null },
      });
      nav(`/diagnosis/${s.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h1>电脑遇到问题？描述一下，我们陪你一步步排查。</h1>
        <p className="muted">校内志愿者提供的公益义诊服务。也可以不经过自助排查，直接预约人工。</p>
        <p className="small muted">问诊文本可由 DeepSeek 辅助理解，请勿输入密码或个人隐私。操作步骤由已发布流程控制。</p>
        <textarea
          rows={3}
          placeholder={EXAMPLES.join(" / ")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {me && <DeviceSelect value={deviceId} onChange={setDeviceId}/>}
        {err && <div className="error-box">{err}</div>}
        <div className="option-row">
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void start()}>
            开始智能排障
          </button>
          <Link className="btn" to="/my/tickets">直接预约人工义诊</Link>
        </div>
      </div>

      {events.length > 0 && (
        <div className="card">
          <h3>正在开放的义诊活动</h3>
          {events.map((e) => (
            <p key={e.id}>
              <strong>{e.title}</strong> · {e.location.name}（{e.location.building_room}）
              <br /><span className="muted small">{e.service_scope}；{e.bring_note}</span>
            </p>
          ))}
        </div>
      )}

      <div className="card">
        <h3>高频问题指南</h3>
        <ul>
          {guides.slice(0, 5).map((g) => (
            <li key={g.id}>
              <Link to={`/guides/${g.id}`}>{g.title}</Link>
              <span className="muted small">（约 {g.estimated_minutes} 分钟 · {g.difficulty === "easy" ? "简单" : "中等"}）</span>
            </li>
          ))}
        </ul>
        <Link to="/guides">查看全部指南 →</Link>
      </div>
    </div>
  );
}
