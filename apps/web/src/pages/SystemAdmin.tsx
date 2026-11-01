import { LoadingState, EmptyState } from "../components/AsyncState";
import PageHeader from "../components/PageHeader";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
interface User {
  id: string;
  email: string;
  display_name: string;
  roles: string[];
  is_active: number;
  email_verified: number;
}
const roles = {
  user: "普通用户",
  staff: "维修志愿者",
  dispatcher: "调度员",
  reviewer: "知识审核员",
  admin: "系统管理员",
};
export default function SystemAdmin() {
  const { hasRole } = useAuth();
  const [users, setUsers] = useState<User[]>([]),
    [runtime, setRuntime] = useState<Record<string, unknown>>({}),
    [audits, setAudits] = useState<
      { id: string; action: string; entity_type: string; created_at: string }[]
    >([]);
  const [busy, setBusy] = useState(false),
    [reading, setReading] = useState(true),
    [query, setQuery] = useState("");
  const [err, setErr] = useState(""),
    [msg, setMsg] = useState("");
  const [jobs, setJobs] = useState<
    {
      id: string;
      kind: string;
      status: string;
      attempts: number;
      last_error: string;
    }[]
  >([]);
  async function refresh() {
    const [u, r, a, j] = await Promise.all([
      api<User[]>("/admin/users"),
      api<Record<string, unknown>>("/admin/runtime"),
      api<typeof audits>("/admin/audit"),
      api<typeof jobs>("/admin/jobs"),
    ]);
    setUsers(u);
    setRuntime(r);
    setAudits(a);
    setJobs(j);
  }
  useEffect(() => {
    void refresh()
      .catch((e) => setErr(e.message))
      .finally(() => setReading(false));
  }, []);
  async function save(u: User) {
    if (busy) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api(`/admin/users/${u.id}`, {
        method: "PUT",
        body: { roles: u.roles, is_active: Boolean(u.is_active) },
      });
      setMsg("权限已保存，目标账号已有登录会话已撤销");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!hasRole("admin"))
    return <div className="error-box">需要系统管理员权限</div>;
  return (
    <div>
      <PageHeader
        eyebrow="SYSTEM / 系统管理"
        title="系统与账号管理"
        description="维护账号权限，查看运行状态、后台任务与操作记录。"
      />
      {err && (
        <div className="error-box" role="alert">
          {err}
        </div>
      )}
      {msg && <div className="alert-ok">{msg}</div>}
      <div className="card">
        <h3>运行概况</h3>
        <p>
          环境：{String(runtime.environment || "")} · 数据库：
          {String(runtime.database || "")} · 附件：
          {String(runtime.storage || "")}
        </p>
        <p>
          模型：
          {runtime.model_configured
            ? String(runtime.chat_model)
            : "未配置，使用已发布流程"}{" "}
          · 邮件：{runtime.email_configured ? "已配置队列发送" : "未配置"}
        </p>
        <pre className="content-preview">
          {JSON.stringify(
            {
              模型调用: runtime.model_runs,
              任务: runtime.jobs,
              检索: runtime.retrieval,
            },
            null,
            2,
          )}
        </pre>
        <p className="small muted">
          记录调用数、延迟及 Token 用量；未配置价格时不估算费用。
        </p>
      </div>
      {reading && <LoadingState label="正在加载系统信息…" />}
      <div className="card">
        <label htmlFor="system-user-search">查找账号</label>
        <input
          id="system-user-search"
          placeholder="搜索昵称或邮箱"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {users
        .filter((u) =>
          `${u.display_name} ${u.email}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .map((u) => (
          <div className="card" key={u.id}>
            <h3>{u.display_name}</h3>
            <p>
              {u.email} · {u.email_verified ? "已验证" : "未验证"}
            </p>
            <fieldset disabled={busy}>
              <legend>角色</legend>
              {Object.entries(roles).map(([key, label]) => (
                <label className="checkbox-label" key={key}>
                  <input
                    type="checkbox"
                    checked={u.roles.includes(key)}
                    onChange={(e) =>
                      setUsers(
                        users.map((x) =>
                          x.id === u.id
                            ? {
                                ...x,
                                roles: e.target.checked
                                  ? [...x.roles, key]
                                  : x.roles.filter((r) => r !== key),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="checkbox-label">
              <input
                type="checkbox"
                disabled={busy}
                checked={Boolean(u.is_active)}
                onChange={(e) =>
                  setUsers(
                    users.map((x) =>
                      x.id === u.id
                        ? { ...x, is_active: e.target.checked ? 1 : 0 }
                        : x,
                    ),
                  )
                }
              />
              账号启用
            </label>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void save(u)}
            >
              保存权限与账号状态
            </button>
          </div>
        ))}
      <div className="card">
        <h3>后台任务</h3>
        {!reading && !jobs.length && (
          <p className="muted small">暂无后台任务</p>
        )}
        {jobs.map((j) => (
          <p key={j.id}>
            {j.kind} · {j.status} · 尝试 {j.attempts} 次 {j.last_error}{" "}
            {j.status === "failed" && (
              <button
                className="btn"
                onClick={() =>
                  void api(`/admin/jobs/${j.id}/retry`, { method: "POST" })
                    .then(refresh)
                    .catch((e) => setErr(e.message))
                }
              >
                重新排队
              </button>
            )}
          </p>
        ))}
      </div>
      <div className="card">
        <h3>操作审计</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>操作</th>
                <th>对象</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id}>
                  <td>
                    {new Date(a.created_at).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}
                  </td>
                  <td>{a.action}</td>
                  <td>{a.entity_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
