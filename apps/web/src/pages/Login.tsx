import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { back?: string; symptom?: string } };
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
      nav(loc.state?.back ?? "/",{state:{symptom:loc.state?.symptom}});
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>{mode === "login" ? "登录" : "注册"}</h2>
      <label>邮箱</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label>密码</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {mode === "register" && (
        <>
          <label>昵称</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </>
      )}
      {err && <div className="error-box">{err}</div>}
      <div className="option-row">
        <button className="btn btn-primary" disabled={busy || !email || password.length < 8}
                onClick={() => void submit()}>
          {mode === "login" ? "登录" : "注册并登录"}
        </button>
        <button className="btn btn-ghost"
                onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "没有账号？注册" : "已有账号？登录"}
        </button>
      </div>
      <p className="muted small">
        演示账号：user@demo.local / staff@demo.local / admin@demo.local（密码见 README）
      </p>
    </div>
  );
}
