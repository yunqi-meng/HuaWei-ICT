import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";
import { ErrorState, LoadingState } from "../components/AsyncState";
import Icon from "../components/Icon";
interface Status {
  email_verified: boolean;
  verification_required: boolean;
}
export default function Account() {
  const { me } = useAuth();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Status>("/auth/me", { signal: controller.signal })
      .then(setStatus)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(
      () => setCooldown((value) => value - 1),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function send() {
    if (busy || cooldown) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string; dev_code?: string }>(
        "/auth/verification-code",
        { method: "POST" },
      );
      setMessage(
        result.message +
          (result.dev_code ? `（开发测试验证码：${result.dev_code}）` : ""),
      );
      setCooldown(60);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/auth/verify-email", { body: { code } });
      setStatus(await api<Status>("/auth/me"));
      setMessage("邮箱验证成功");
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow="YOUR ACCOUNT / 账号设置"
        title="账号与邮箱验证"
        description="管理你的账号信息，确认邮箱可正常接收服务通知。"
      />
      <section className="card" style={{ maxWidth: 720 }}>
        <div className="section-heading">
          <div>
            <h2>{me?.display_name}</h2>
            <p className="muted">{me?.email}</p>
          </div>
          <span className="service-icon">
            <Icon name="user" size={24} />
          </span>
        </div>
        {error && <ErrorState message={error} />}
        {message && (
          <div className="alert-ok" role="status">
            {message}
          </div>
        )}
        {!status ? (
          !error && <LoadingState label="正在读取账号状态…" />
        ) : (
          <>
            <span
              className={`badge ${status.email_verified ? "badge-ok" : "badge-warn"}`}
            >
              {status.email_verified ? "邮箱已验证" : "邮箱待验证"}
            </span>
            <p className="muted small" style={{ marginTop: 14 }}>
              {status.verification_required
                ? "提交工单与预约前需要验证邮箱。"
                : "当前演示环境未强制验证邮箱。"}
            </p>
            {!status.email_verified && (
              <>
                <button
                  className="btn"
                  disabled={busy || cooldown > 0}
                  onClick={() => void send()}
                >
                  {cooldown ? `${cooldown} 秒后可重发` : "发送验证码"}
                </button>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void verify();
                  }}
                >
                  <label htmlFor="email-code">邮箱验证码</label>
                  <input
                    id="email-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="输入 6 位数字验证码"
                    maxLength={6}
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, ""))
                    }
                  />
                  <div className="option-row">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={busy || !/^\d{6}$/.test(code)}
                    >
                      {busy ? "正在处理…" : "验证邮箱"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
