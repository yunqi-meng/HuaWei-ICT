import { useState } from "react";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncState";
import { useResource } from "../hooks/useResource";
import { api } from "../api";
import type { Device } from "../components/DeviceSelect";
const blank={kind:"laptop",brand_model:"",os_family:"windows",os_version:"Windows 11"};
export default function Devices(){
  const resource=useResource<Device[]>("/devices");
  const [form,setForm]=useState(blank);
  const [editing,setEditing]=useState("");
  const [deleting,setDeleting]=useState<Device|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  async function save(){
    if(busy||!form.brand_model.trim())return;
    setBusy(true);setError("");setMessage("");
    try{await api(editing?`/devices/${editing}`:"/devices",{method:editing?"PUT":"POST",body:{...form,brand_model:form.brand_model.trim()}});setMessage(editing?"设备信息已更新":"设备已添加，可在排查时选择");setForm(blank);setEditing("");resource.reload();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function remove(){
    if(!deleting||busy)return;
    setBusy(true);setError("");
    try{await api(`/devices/${deleting.id}`,{method:"DELETE"});if(editing===deleting.id){setEditing("");setForm(blank);}setDeleting(null);setMessage("设备已删除");resource.reload();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div><PageHeader eyebrow="我的设备" title="管理你的电脑与系统" description="填写设备信息，排查时选择对应电脑，让每一步检查更贴近实际环境。"/>
    {message&&<div className="alert-ok" role="status"><Icon name="check" size={18}/>{message}</div>}
    {error&&!deleting&&<ErrorState message={error}/>}
    <div className="device-layout"><form className="card device-editor" onSubmit={event=>{event.preventDefault();void save();}}>
      <h2>{editing?"编辑设备信息":"添加一台设备"}</h2><p className="small muted">只需填写型号与系统，稍后也能修改。</p>
      <label htmlFor="device-model">品牌型号或备注名</label><input id="device-model" placeholder="例如：我的笔记本" maxLength={120} value={form.brand_model} required disabled={busy} onChange={event=>setForm({...form,brand_model:event.target.value})}/>
      <label htmlFor="device-kind">设备类型</label><select id="device-kind" value={form.kind} disabled={busy} onChange={event=>setForm({...form,kind:event.target.value})}><option value="laptop">笔记本</option><option value="desktop">台式机</option><option value="other">其他设备</option></select>
      <label htmlFor="device-os">操作系统</label><select id="device-os" value={form.os_family} disabled={busy} onChange={event=>setForm({...form,os_family:event.target.value,os_version:({windows:"Windows 11",macos:"macOS",linux:"Linux",other:""} as Record<string,string>)[event.target.value]||""})}><option value="windows">Windows</option><option value="macos">macOS</option><option value="linux">Linux</option><option value="other">其他 / 不确定</option></select>
      <label htmlFor="device-version">系统版本</label><input id="device-version" maxLength={60} value={form.os_version} disabled={busy} onChange={event=>setForm({...form,os_version:event.target.value})}/>
      <div className="option-row"><button type="submit" className="btn btn-primary" disabled={busy||!form.brand_model.trim()}><Icon name={editing?"check":"plus"} size={16}/>{busy?"正在保存…":editing?"保存修改":"添加设备"}</button>{editing&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setEditing("");setForm(blank);}}>取消编辑</button>}</div>
    </form>
    <section className="device-list" aria-label="已保存的设备"><h2 className="device-list-heading">设备列表<span className="count-badge">{resource.data?.length??0}</span></h2>
      {resource.error?<ErrorState message={resource.error} retry={resource.reload}/>:resource.loading?<LoadingState label="正在读取设备…"/>:!resource.data?.length?<div className="card"><EmptyState title="还没有添加设备" description="填写设备型号与系统，之后排查和报修时就能直接选择。"/></div>:resource.data.map(device=><article className="card device-list-item" key={device.id}><span className="device-list-icon"><Icon name={device.kind==="laptop"?"laptop":"monitor"} size={23}/></span><div><h3>{device.brand_model}</h3><p>{device.os_version||device.os_family}<span className="badge badge-neutral" style={{marginLeft:10}}>{device.kind==="laptop"?"笔记本":device.kind==="desktop"?"台式机":"其他设备"}</span></p><div className="option-row"><button className="btn" disabled={busy} onClick={()=>{setEditing(device.id);setForm({kind:device.kind,brand_model:device.brand_model,os_family:device.os_family,os_version:device.os_version});document.getElementById("device-model")?.focus();}}>编辑设备</button><button className="text-button" disabled={busy} onClick={()=>{setError("");setDeleting(device);}}>删除设备</button></div></div></article>)}
    </section></div>
    {deleting&&<Modal title="删除这台设备？" onClose={()=>{if(!busy){setDeleting(null);setError("");}}}><p>将删除“{deleting.brand_model}”的设备信息。已关联排障或工单的设备会由系统保留。</p>{error&&<ErrorState message={error}/>}<div className="option-row"><button className="btn btn-danger" disabled={busy} onClick={()=>void remove()}>{busy?"正在删除…":"确认删除"}</button><button className="btn" disabled={busy} onClick={()=>{setDeleting(null);setError("");}}>保留设备</button></div></Modal>}
  </div>;
}
