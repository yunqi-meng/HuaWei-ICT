import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncState";
interface Notice {
  id: string;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
}
export default function Notifications() {
  const [items, setItems] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  async function refresh() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await api<Notice[]>("/notifications", {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setItems(result);
        setError("");
      }
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 20000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      request.current?.abort();
    };
  }, []);
  async function read(id: string) {
    if (pending.includes(id)) return;
    setPending((previous) => [...previous, id]);
    setError("");
    try {
      await api(`/notifications/${id}/read`, { method: "POST" });
      if (mounted.current) {
        setItems((previous) =>
          previous.map((item) =>
            item.id === id
              ? { ...item, read_at: new Date().toISOString() }
              : item,
          ),
        );
        void refresh();
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current)
        setPending((previous) => previous.filter((value) => value !== id));
    }
  }
  const visible = unreadOnly ? items.filter((item) => !item.read_at) : items;
  return (
    <div>
      <PageHeader
        eyebrow="INBOX / 站内通知"
        title="服务进展，及时知道。"
        description="预约提醒、工单动态与服务通知，集中在这里查看。"
        actions={
          <button className="btn" onClick={() => void refresh()}>
            <Icon name="refresh" size={16} />
            刷新
          </button>
        }
      />
      <div className="section-heading">
        <div className="segmented" role="group" aria-label="通知筛选">
          <button
            aria-pressed={!unreadOnly}
            onClick={() => setUnreadOnly(false)}
          >
            全部通知
          </button>
          <button aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
            未读{" "}
            <span className="count-badge">
              {items.filter((item) => !item.read_at).length}
            </span>
          </button>
        </div>
      </div>
      {error && <ErrorState message={error} retry={() => void refresh()} />}
      {loading ? (
        <LoadingState />
      ) : !visible.length ? (
        !error && (
          <section className="card">
            <EmptyState
              title={unreadOnly ? "所有通知都已读" : "还没有通知"}
              description="有新的服务进展时，会在这里通知你。"
            />
          </section>
        )
      ) : (
        visible.map((notice) => (
          <article
            className={`card notice-card ${!notice.read_at ? "unread" : ""}`}
            key={notice.id}
          >
            <h3>
              {notice.title}
              {!notice.read_at && <span className="badge badge-ok">未读</span>}
            </h3>
            <p>{notice.body}</p>
            <span className="muted small">
              {new Date(notice.created_at).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </span>
            <div className="option-row">
              {notice.link?.startsWith("/") &&
                !notice.link.startsWith("//") && (
                  <Link className="btn" to={notice.link}>
                    查看详情 <Icon name="arrow" size={15} />
                  </Link>
                )}
              {!notice.read_at && (
                <button
                  className="text-button"
                  disabled={pending.includes(notice.id)}
                  onClick={() => void read(notice.id)}
                >
                  {pending.includes(notice.id) ? "正在标记…" : "标记已读"}
                </button>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
