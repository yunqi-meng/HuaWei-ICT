import Icon from "./Icon";
export function LoadingState({ label = "正在加载…" }: { label?: string }) {
  return (
    <div className="empty-state" role="status">
      <span className="spinner" />
      <p>{label}</p>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-box" role="alert">
      <Icon name="info" />
      <span>{message}</span>
      {retry && (
        <button className="btn btn-ghost" onClick={retry}>
          重新加载
        </button>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="search" size={26} />
      </span>
      <h3>{title}</h3>
      {description && <p className="muted">{description}</p>}
    </div>
  );
}
