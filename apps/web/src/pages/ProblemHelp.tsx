import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import DeviceSelect from "../components/DeviceSelect";
import PageHeader from "../components/PageHeader";
import Icon, { type IconName } from "../components/Icon";
import { ErrorState } from "../components/AsyncState";

const problems: {
  label: string;
  hint: string;
  text: string;
  icon: IconName;
}[] = [
  {
    label: "电脑卡顿 / 启动慢",
    hint: "运行缓慢、程序无响应",
    text: "我的电脑最近运行很慢，开机和打开软件都要等很久。",
    icon: "bolt",
  },
  {
    label: "无法连接网络",
    hint: "Wi-Fi、网线与连接问题",
    text: "电脑无法上网，想检查是网络连接还是系统设置的问题。",
    icon: "monitor",
  },
  {
    label: "没有声音",
    hint: "音量、耳机与输出设备",
    text: "电脑没有声音，调整音量后仍然听不到。",
    icon: "info",
  },
  {
    label: "外接显示器异常",
    hint: "黑屏、连接与显示设置",
    text: "连接外接显示器后没有画面，电脑屏幕本身可以正常使用。",
    icon: "monitor",
  },
  {
    label: "应用无法打开",
    hint: "启动失败、报错与闪退",
    text: "电脑上的一个应用打不开，启动时会报错或闪退。",
    icon: "grid",
  },
  {
    label: "磁盘空间不足",
    hint: "存储占满与空间检查",
    text: "电脑提示磁盘空间不足，想确认哪些内容可以安全清理。",
    icon: "chip",
  },
];

export default function ProblemHelp() {
  const { me, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [symptom, setSymptom] = useState(
    (location.state as { symptom?: string } | null)?.symptom || "",
  );
  const [deviceId, setDeviceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  async function start() {
    if (pending.current || symptom.trim().length < 2) return;
    if (!me) {
      navigate("/login", { state: { back: "/help", symptom } });
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const session = await api<{ id: string }>("/diagnosis-sessions", {
        body: { symptom_text: symptom.trim(), device_id: deviceId || null },
      });
      navigate(`/diagnosis/${session.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow="HERE TO HELP / 问题求助"
        title="先别着急，一步步来。"
        description="告诉我们电脑遇到了什么问题，我们会引导你确认设备与系统，再按适用流程排查。"
      />
      <div className="help-layout">
        <div>
          <section className="card help-form">
            <div className="section-heading">
              <div>
                <h2>描述你的电脑问题</h2>
                <p className="muted small">
                  发生了什么、什么时候出现、是否有报错，都可以告诉我们。
                </p>
              </div>
              <span className="service-icon">
                <Icon name="tool" size={23} />
              </span>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void start();
              }}
            >
              {me && <DeviceSelect value={deviceId} onChange={setDeviceId} />}
              <label htmlFor="symptom">故障描述</label>
              <textarea
                id="symptom"
                ref={input}
                placeholder="例如：电脑连接 Wi-Fi 后显示已连接，但浏览器打不开网页。"
                value={symptom}
                maxLength={2000}
                required
                minLength={2}
                disabled={busy}
                onChange={(event) => setSymptom(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.ctrlKey || event.metaKey) &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void start();
                  }
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginTop: 8,
                }}
              >
                <span className="muted small">请勿填写密码等私密信息</span>
                <span className="muted small">{symptom.length} / 2000</span>
              </div>
              {error && <ErrorState message={error} />}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || loading || symptom.trim().length < 2}
              >
                {busy
                  ? "正在创建排查会话…"
                  : me
                    ? "开始智能排查"
                    : "登录并开始排查"}
                <Icon name="arrow" size={17} />
              </button>
            </form>
          </section>
          <section className="card">
            <h2>不知道怎么描述？</h2>
            <p className="muted small">
              选择一个常见问题，补充实际情况后开始排查。
            </p>
            <div className="problem-presets">
              {problems.map((problem) => (
                <button
                  key={problem.label}
                  disabled={busy}
                  onClick={() => {
                    setSymptom(problem.text);
                    input.current?.focus();
                  }}
                >
                  <Icon name={problem.icon} />
                  <span>
                    <strong>{problem.label}</strong>
                    <small>{problem.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <aside className="help-sidebar">
          <section className="card">
            <div className="eyebrow">排查怎么进行</div>
            <h2>有方向，也有后援。</h2>
            {[
              {
                title: "确认设备与环境",
                description: "了解故障电脑和操作系统，选择适用流程。",
              },
              {
                title: "按步骤检查",
                description: "一次一步，执行后反馈结果。",
              },
              {
                title: "需要时交给人工",
                description: "保留已尝试的步骤，衔接线下义诊。",
              },
            ].map((step, index) => (
              <div className="help-step" key={step.title}>
                <span>0{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
            <Link to="/guides" className="btn btn-ghost">
              <Icon name="book" size={16} />
              先看看问题指南
            </Link>
          </section>
          <section
            className="card"
            style={{ background: "var(--primary-soft)" }}
          >
            <Icon name="calendar" size={23} />
            <h3 style={{ marginTop: 14 }}>想直接找人帮忙？</h3>
            <p className="muted small">
              预约校园义诊，由维修志愿者面对面协助检查。
            </p>
            <Link to="/appointments/new" className="btn">
              预约线下维修 <Icon name="arrow" size={16} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
