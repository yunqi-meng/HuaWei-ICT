import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Icon from "../components/Icon";

export default function Login() {
  const { login, register, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { back?: string; symptom?: string } | null;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy || loading) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
      const back = state?.back;
      navigate(
        back?.startsWith("/") &&
          !back.startsWith("//") &&
          !back.startsWith("/login")
          ? back
          : "/my/tickets",
        { replace: true, state: { symptom: state?.symptom } },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card auth-card">
      <div className="auth-logo">
        <Icon name="tool" size={25} />
      </div>
      <div className="eyebrow">WELCOME TO ZHIXIU</div>
      <h1>{mode === "login" ? "欢迎回到知修" : "很高兴认识你"}</h1>
      <p className="muted small">
        {mode === "login"
          ? "登录后继续排查、管理设备与查看维修进度。"
          : "创建账号，开启你的校园电脑服务。"}
      </p>
      <div
        className="segmented auth-tabs"
        style={{ display: "flex" }}
        role="group"
        aria-label="账号操作"
      >
        {(
          [
            ["login", "登录"],
            ["register", "注册"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={mode === key}
            disabled={busy}
            onClick={() => {
              setMode(key);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="login-email">邮箱地址</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="yourname@example.com"
          required
          value={email}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="login-password">密码</label>
        <input
          id="login-password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="至少 8 位字符"
          required
          minLength={8}
          value={password}
          disabled={busy}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mode === "register" && (
          <>
            <label htmlFor="login-name">昵称</label>
            <input
              id="login-name"
              autoComplete="nickname"
              placeholder="我们该怎么称呼你"
              required
              maxLength={40}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="option-row">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              busy ||
              loading ||
              !email.trim() ||
              password.length < 8 ||
              (mode === "register" && !name.trim())
            }
          >
            {busy ? "请稍候…" : mode === "login" ? "登录" : "创建账号并登录"}
            <Icon name="arrow" size={17} />
          </button>
        </div>
      </form>
      <p className="auth-caption">
        暂时不登录？<Link to="/">返回首页探索</Link>
      </p>
    </div>
  );
}
