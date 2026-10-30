import { useEffect, useState } from "react";
import { api } from "../api";
import type { Device } from "../components/DeviceSelect";
import { useAuth } from "../auth";
import { Link } from "react-router-dom";

const blank = { kind: "laptop", brand_model: "", os_family: "windows", os_version: "Windows 11" };
export default function Devices() {
  const { me, loading } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => api<Device[]>("/devices").then(setDevices).catch(e => setErr(e.message));
  useEffect(() => { if (me) void refresh(); }, [me]);
  async function save() {
    setBusy(true); setErr("");
    try {
      await api(editing ? `/devices/${editing}` : "/devices", { method: editing ? "PUT" : "POST", body: form });
      setForm(blank); setEditing(""); await refresh();
    } catch(e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api(`/devices/${id}`, { method: "DELETE" }); await refresh(); }
    catch(e) { setErr((e as Error).message); }
  }
  if (loading) return <p>加载中…</p>;
  if (!me) return <Link to="/login">请先登录</Link>;
  return <div><h2>我的故障设备</h2><p className="muted">设备信息由你填写，用于选择适用流程；网页不会自动扫描硬件。</p>
    {err && <div className="error-box" role="alert">{err}</div>}
    <div className="card"><h3>{editing ? "编辑设备" : "添加设备"}</h3>
      <label htmlFor="device-model">品牌型号或备注名</label><input id="device-model" maxLength={120} value={form.brand_model} onChange={e => setForm({...form, brand_model:e.target.value})}/>
      <label htmlFor="device-kind">设备类型</label><select id="device-kind" value={form.kind} onChange={e => setForm({...form,kind:e.target.value})}>
        <option value="laptop">笔记本</option><option value="desktop">台式机</option><option value="other">其他</option></select>
      <label htmlFor="device-os">系统</label><select id="device-os" value={form.os_family} onChange={e => setForm({...form,os_family:e.target.value,os_version:e.target.value === "windows" ? "Windows 11" : "macOS"})}>
        <option value="windows">Windows</option><option value="macos">macOS</option><option value="linux">Linux</option><option value="other">其他</option></select>
      <label htmlFor="device-version">系统版本</label><input id="device-version" maxLength={60} value={form.os_version} onChange={e=>setForm({...form,os_version:e.target.value})}/>
      <div className="option-row"><button className="btn btn-primary" disabled={busy || !form.brand_model.trim()} onClick={()=>void save()}>保存设备</button>
      {editing && <button className="btn" onClick={()=>{setEditing("");setForm(blank);}}>取消编辑</button>}</div>
    </div>
    {devices.map(d=><div className="card" key={d.id}><h3>{d.brand_model}</h3><p>{d.os_version}</p><div className="option-row">
      <button className="btn" onClick={()=>{setEditing(d.id);setForm(d);}}>编辑</button><button className="btn btn-danger" onClick={()=>void remove(d.id)}>删除未使用的设备</button></div></div>)}
  </div>;
}
