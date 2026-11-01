import { Component, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import Icon from "./Icon";
import { LoadingState } from "./AsyncState";

const primaryLinks = [
  { to: "/help", label: "问题求助", icon: "tool" },
  { to: "/perf", label: "性能对比", icon: "chart" },
  { to: "/quality", label: "做工对比", icon: "chip" },
  { to: "/guides", label: "问题指南", icon: "book" },
] as const;

export function TopNav() {
  const { me, loading, logout, hasRole } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setOpen(false);
    setError("");
  }, [pathname]);
  return (
    <header className="app-header">
      <div className="nav-inner">
        <Link to="/" className="brand" aria-label="知修首页">
          <span className="brand-mark">
            <Icon name="tool" size={23} />
          </span>
          <span>
            知修<span className="brand-caption">校园电脑义诊</span>
          </span>
        </Link>
        <button
          className="btn btn-icon mobile-menu"
          aria-label={open ? "收起导航" : "展开导航"}
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "close" : "menu"} />
          <span className="menu-label">菜单</span>
        </button>
        <nav
          id="main-navigation"
          aria-label="主导航"
          className={`primary-nav ${open ? "is-open" : ""}`}
        >
          {primaryLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <Icon name={item.icon} size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-account">
          {loading ? (
            <span className="small muted">加载中</span>
          ) : me ? (
            <>
              <NavLink to="/my/tickets" className="nav-service">
                我的服务
              </NavLink>
              <NavLink
                to="/notifications"
                className="nav-icon"
                aria-label="站内通知"
              >
                <Icon name="bell" size={19} />
              </NavLink>
              <NavLink to="/my/account" className="account-link">
                <span className="avatar">{me.display_name.slice(0, 1)}</span>
                <span>{me.display_name}</span>
              </NavLink>
              <button
                className="text-button logout-button"
                disabled={leaving}
                onClick={async () => {
                  setLeaving(true);
                  setError("");
                  try {
                    await logout();
                  } catch {
                    setError("退出失败，请重试。");
                  } finally {
                    setLeaving(false);
                  }
                }}
              >
                {leaving ? "退出中…" : "退出"}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              state={{ back: pathname }}
              className="btn btn-primary nav-login"
            >
              登录 / 注册 <Icon name="arrow" size={15} />
            </Link>
          )}
        </div>
      </div>
      {error && (
        <div className="nav-error" role="alert">
          {error}
        </div>
      )}
      {(pathname.startsWith("/my/") ||
        pathname === "/notifications" ||
        pathname.startsWith("/tickets/") ||
        pathname.startsWith("/admin") ||
        pathname.startsWith("/staff") ||
        pathname.startsWith("/hardware")) && (
        <nav className="secondary-nav" aria-label="相关功能">
          {pathname.startsWith("/hardware") ? (
            <>
              <NavLink end to="/hardware">
                硬件数据库
              </NavLink>
              <NavLink to="/hardware/rankings">基准排行榜</NavLink>
              <NavLink to="/hardware/compare">多芯片对比</NavLink>
              <Link to="/perf">性能天梯与能耗</Link>
            </>
          ) : (
            <>
              <NavLink to="/my/tickets">我的服务</NavLink>
              <NavLink to="/my/devices">我的设备</NavLink>
              <NavLink to="/notifications">站内通知</NavLink>
              <NavLink to="/my/account">账号设置</NavLink>
              {hasRole("staff", "admin") && (
                <NavLink to="/staff">维修工作台</NavLink>
              )}
              {hasRole("admin", "dispatcher") && (
                <>
                  <NavLink end to="/admin">
                    运营概览
                  </NavLink>
                  <NavLink to="/admin/scheduling">活动排班</NavLink>
                </>
              )}
              {hasRole("admin", "reviewer") && (
                <NavLink to="/admin/knowledge">知识编审</NavLink>
              )}
              {hasRole("admin") && (
                <NavLink to="/admin/system">系统管理</NavLink>
              )}
            </>
          )}
        </nav>
      )}
    </header>
  );
}

export function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: string[];
}) {
  const { me, loading, hasRole } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState label="正在确认登录状态…" />;
  if (!me)
    return (
      <Navigate
        to="/login"
        replace
        state={{ back: `${location.pathname}${location.search}` }}
      />
    );
  if (roles && !hasRole(...roles))
    return (
      <div className="card empty-state">
        <Icon name="shield" size={32} />
        <h1>暂无访问权限</h1>
        <p className="muted">当前账号无法使用此功能。</p>
        <Link className="btn" to="/my/tickets">
          返回我的服务
        </Link>
      </div>
    );
  return <>{children}</>;
}

export function RouteEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const names: Record<string, string> = {
      help: "问题求助",
      perf: "性能对比",
      quality: "做工对比",
      guides: "问题指南",
      hardware: "硬件探索",
      login: "登录",
      my: "我的服务",
      admin: "运营管理",
      staff: "维修工作台",
      notifications: "站内通知",
      diagnosis: "智能排障",
      tickets: "工单详情",
      appointments: "预约维修",
    };
    document.title = `${names[pathname.split("/")[1]] || "校园电脑义诊"} · 知修`;
  }, [pathname]);
  return null;
}

export class PageErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="card empty-state" role="alert">
          <h1>页面暂时无法显示</h1>
          <p className="muted">请刷新重试，或返回首页继续使用。</p>
          <div className="option-row">
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              刷新页面
            </button>
            <a className="btn" href="/">
              返回首页
            </a>
          </div>
        </div>
      );
    return this.props.children;
  }
}

export function AppFooter() {
  return (
    <footer className="app-footer">
      <span>
        <strong>知修</strong> · 让电脑问题，简单一点。
      </span>
      <div>
        <Link to="/guides">问题指南</Link>
        <Link to="/my/tickets">维修服务</Link>
        <span>校园电脑义诊</span>
      </div>
    </footer>
  );
}
