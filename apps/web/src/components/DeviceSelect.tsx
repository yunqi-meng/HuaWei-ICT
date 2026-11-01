import { useId } from "react";
import { Link } from "react-router-dom";
import { useResource } from "../hooks/useResource";
export interface Device {
  id: string;
  kind: string;
  brand_model: string;
  os_family: string;
  os_version: string;
}
export default function DeviceSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const {
    data: devices,
    loading,
    error,
    reload,
  } = useResource<Device[]>("/devices");
  return (
    <div>
      <label htmlFor={id}>故障设备</label>
      <select
        id={id}
        value={value}
        disabled={loading}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {loading ? "正在读取设备…" : "暂不选择，排障时确认系统"}
        </option>
        {devices?.map((device) => (
          <option key={device.id} value={device.id}>
            {device.brand_model || "未命名电脑"} · {device.os_version}
          </option>
        ))}
      </select>
      {error ? (
        <p className="small" role="alert">
          设备暂时无法加载。
          <button className="text-button" onClick={reload}>
            重试
          </button>
        </p>
      ) : (
        <p className="small muted" style={{ marginTop: 7 }}>
          请选择遇到故障的电脑，也可稍后确认。
          <Link to="/my/devices">管理设备 →</Link>
        </p>
      )}
    </div>
  );
}
