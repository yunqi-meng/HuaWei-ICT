import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export interface Device { id: string; kind: string; brand_model: string; os_family: string; os_version: string }

export default function DeviceSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  useEffect(() => { api<Device[]>("/devices").then(setDevices).catch(() => undefined); }, []);
  return <div>
    <label htmlFor="fault-device">故障设备</label>
    <select id="fault-device" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">暂不选择，排障时确认系统</option>
      {devices.map(d => <option key={d.id} value={d.id}>{d.brand_model || "未命名电脑"} · {d.os_version}</option>)}
    </select>
    <p className="small muted">请选择遇到故障的电脑。用手机访问时，手机不会被自动识别为故障设备。<Link to="/my/devices">管理设备</Link></p>
  </div>;
}
