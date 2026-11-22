import { Component, useLayoutEffect, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import Icon from "./Icon";
import { LoadingState } from "./AsyncState";
import { pageAccent, routeLabel } from "../navigation";

export { default as TopNav } from "./WorkspaceNav";

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
  useLayoutEffect(() => {
    document.documentElement.dataset.accent = pageAccent(pathname);
    window.scrollTo({ top: 0, behavior: "instant" });
    document.title = `${routeLabel(pathname)} · 知修`;
    // 路由切换后把键盘阅读位置移到正文；筛选参数变化不抢焦点。
    const frame = requestAnimationFrame(() => {
      const main = document.getElementById("main-content");
      main?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
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
