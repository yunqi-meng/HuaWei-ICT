import { LoadingState } from "../components/AsyncState";
import PageHeader from "../components/PageHeader";
import { useEffect, useState, type FormEvent } from "react";
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
interface NewUser {
  email: string;
  display_name: string;
  password: string;
  roles: string[];
  is_active: boolean;
}
const blankUser: NewUser = {
  email: "",
  display_name: "",
  password: "",
  roles: ["user"],
  is_active: true,
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
  const [draft, setDraft] = useState<NewUser>(blankUser);
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
  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api("/admin/users", { method: "POST", body: draft });
      setMsg(`已创建账号 ${draft.email.trim().toLowerCase()}，可直接用初始密码登录`);
      setDraft(blankUser);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!hasRole("admin"))
    return <div className="error-box">需要系统管理员权限</div>;
  const readiness=runtime.readiness as {blockers?:string[];counts?:Record<string,number>}|undefined;
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
      {msg && <div className="alert-ok" role="status" aria-live="polite">{msg}</div>}
      <div className="card">
        <h3>运行概况</h3>
        <dl className="runtime-overview"><div><dt>当前环境</dt><dd>{runtime.environment==="dev"?"本地开发":String(runtime.environment||"加载中")}</dd></div><div><dt>业务数据库</dt><dd>{String(runtime.database||"加载中")}</dd></div><div><dt>附件存储</dt><dd>{runtime.storage==="private-local"?"私有本地存储":String(runtime.storage||"加载中")}</dd></div><div><dt>邮件服务</dt><dd>{runtime.email_configured?"已配置发送队列":"未配置"}</dd></div></dl>
        <p className="notice">模型：{runtime.model_configured?String(runtime.chat_model):"未配置，使用已发布流程"}。配置状态不代表实时服务可达性。</p>
        {readiness?.blockers&&<details className="readiness-summary" open><summary>正式使用前检查<span className="badge badge-warn">{readiness.blockers.length} 项待处理</span></summary><ul>{readiness.blockers.map(item=><li key={item}>{item}</li>)}</ul></details>}
        <details className="runtime-details"><summary>查看模型调用、检索与后台任务明细</summary>
        <pre className="content-preview">
          {JSON.stringify(
            {
              模型调用: runtime.model_runs,
              任务: runtime.jobs,
              正式使用前检查: runtime.readiness,
              检索: runtime.retrieval,
            },
            null,
            2,
          )}
        </pre>
        </details>
        <p className="small muted">
          记录调用数、延迟及 Token 用量；未配置价格时不估算费用。
        </p>
      </div>
      {reading && <LoadingState label="正在加载系统信息…" />}
      <div className="card">
        <h3>新增用户</h3>
        <p className="small muted">
          管理员可直接创建账号并分配角色，无需本人注册；新账号视为邮箱已验证。
        </p>
        <form onSubmit={(event) => void createUser(event)}>
          <div className="form-grid">
            <div>
              <label htmlFor="new-user-email">邮箱</label>
              <input
                id="new-user-email"
                type="email"
                autoComplete="off"
                required
                maxLength={200}
                value={draft.email}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="new-user-name">显示名称</label>
              <input
                id="new-user-name"
                required
                maxLength={80}
                value={draft.display_name}
                disabled={busy}
                onChange={(e) =>
                  setDraft({ ...draft, display_name: e.target.value })
                }
              />
            </div>
            <div>
              <label htmlFor="new-user-password">初始密码</label>
              <input
                id="new-user-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={draft.password}
                disabled={busy}
                onChange={(e) =>
                  setDraft({ ...draft, password: e.target.value })
                }
              />
            </div>
          </div>
          <fieldset disabled={busy}>
            <legend>角色</legend>
            {Object.entries(roles).map(([key, label]) => (
              <label className="checkbox-label" key={key}>
                <input
                  type="checkbox"
                  checked={draft.roles.includes(key)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      roles: e.target.checked
                        ? [...draft.roles, key]
                        : draft.roles.filter((r) => r !== key),
                    })
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
              checked={draft.is_active}
              onChange={(e) =>
                setDraft({ ...draft, is_active: e.target.checked })
              }
            />
            账号启用
          </label>
          <p className="small muted">密码至少 8 位，建议首次登录后修改。</p>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !draft.roles.length}
          >
            {busy ? "正在创建…" : "创建用户"}
          </button>
        </form>
      </div>
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
        <div className="table-scroll" tabIndex={0} role="region" aria-label="可横向滚动的数据表">
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
