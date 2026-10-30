import {useEffect,useState} from "react";
import {api} from "../api";
import {useAuth} from "../auth";
interface Location{id:string;name:string;building_room:string;workstations:number}
interface Staff{id:string;display_name:string}
interface Event{id:string;title:string;service_date:string;status:string;slots:{id:string;start_at:string;end_at:string;capacity:number;held_count:number;confirmed_count:number}[];shifts:{id:string;staff_id:string;display_name:string;start_at:string;end_at:string}[]}
interface Data{locations:Location[];staff:Staff[];events:Event[]}
export default function SchedulingAdmin(){
  const {hasRole}=useAuth();
  const [data,setData]=useState<Data>({locations:[],staff:[],events:[]});
  const [location,setLocation]=useState({name:"",building_room:"",address_note:"",workstations:2});
  const [form,setForm]=useState({location_id:"",title:"",service_date:"",service_scope:"常见电脑问题初诊",bring_note:"请携带电源并提前备份数据",start:"14:00",end:"17:00",capacity:1});
  const [staffIds,setStaffIds]=useState<string[]>([]),[reason,setReason]=useState("");
  const [err,setErr]=useState(""),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
  const [shiftForm,setShiftForm]=useState({event:"",staff:"",start:"14:00",end:"17:00"});
  const refresh=()=>api<Data>("/admin/scheduling").then(setData);
  useEffect(()=>{void refresh().catch(e=>setErr(e.message));},[]);
  async function act(fn:()=>Promise<unknown>,message:string){setBusy(true);setErr("");setMsg("");try{await fn();await refresh();setMsg(message);}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
  async function createEvent(){
    const parse=(s:string)=>{const [h,m]=s.split(":").map(Number);return h*60+m;};
    const start=parse(form.start),end=parse(form.end);
    if(end<=start||(end-start)%30!==0)throw new Error("时间应按完整的 30 分钟时段设置");
    const fmt=(m:number)=>`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
    const slots=[];for(let t=start;t<end;t+=30)slots.push({start_at:fmt(t),end_at:fmt(t+30),capacity:form.capacity});
    const event=await api<{id:string}>("/admin/service-events",{body:{...form,slots}});
    for(const id of staffIds)await api(`/admin/service-events/${event.id}/shifts`,{body:{staff_id:id,start_at:form.start,end_at:form.end}});
  }
  if(!hasRole("admin","dispatcher"))return <div className="error-box">需要调度权限</div>;
  return <div><h2>活动、场地与排班</h2>{err&&<div className="error-box" role="alert">{err}</div>}{msg&&<div className="alert-ok">{msg}</div>}
    <details className="card"><summary>新增服务场地</summary><label>场地名称</label><input value={location.name} onChange={e=>setLocation({...location,name:e.target.value})}/><label>楼栋与房间</label><input value={location.building_room} onChange={e=>setLocation({...location,building_room:e.target.value})}/><label>到场指引</label><input value={location.address_note} onChange={e=>setLocation({...location,address_note:e.target.value})}/><label>可用工位</label><input type="number" min={1} max={100} value={location.workstations} onChange={e=>setLocation({...location,workstations:Number(e.target.value)})}/><div className="option-row"><button className="btn" disabled={busy} onClick={()=>void act(()=>api("/admin/locations",{body:location}),"场地已添加")}>保存场地</button></div></details>
    <div className="card"><h3>创建活动草稿</h3><div className="form-grid">
      <div><label>活动名称</label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></div>
      <div><label>服务场地</label><select value={form.location_id} onChange={e=>setForm({...form,location_id:e.target.value})}><option value="">请选择</option>{data.locations.map(l=><option key={l.id} value={l.id}>{l.name} · {l.building_room}（{l.workstations} 工位）</option>)}</select></div>
      <div><label>服务日期</label><input type="date" value={form.service_date} onChange={e=>setForm({...form,service_date:e.target.value})}/></div>
      <div><label>每半小时容量</label><input type="number" min={1} value={form.capacity} onChange={e=>setForm({...form,capacity:Number(e.target.value)})}/></div>
      <div><label>开始时间</label><input type="time" value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></div>
      <div><label>结束时间</label><input type="time" value={form.end} onChange={e=>setForm({...form,end:e.target.value})}/></div>
    </div><label>服务范围</label><input value={form.service_scope} onChange={e=>setForm({...form,service_scope:e.target.value})}/><label>携带说明</label><input value={form.bring_note} onChange={e=>setForm({...form,bring_note:e.target.value})}/>
    <fieldset><legend>本次值班人员（覆盖整个活动时段）</legend>{data.staff.map(s=><label className="checkbox-label" key={s.id}><input type="checkbox" checked={staffIds.includes(s.id)} onChange={e=>setStaffIds(e.target.checked?[...staffIds,s.id]:staffIds.filter(id=>id!==s.id))}/>{s.display_name}</label>)}</fieldset>
    <button className="btn btn-primary" disabled={busy||!form.location_id||!form.title||!form.service_date} onClick={()=>void act(createEvent,"活动草稿已创建，请核对排班后发布")}>保存草稿与排班</button></div>
    <details className="card"><summary>补充单段排班</summary><label>活动草稿</label><select value={shiftForm.event} onChange={e=>setShiftForm({...shiftForm,event:e.target.value})}><option value="">选择草稿</option>{data.events.filter(e=>e.status==="draft").map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select><label>维修人员</label><select value={shiftForm.staff} onChange={e=>setShiftForm({...shiftForm,staff:e.target.value})}><option value="">请选择</option>{data.staff.map(s=><option key={s.id} value={s.id}>{s.display_name}</option>)}</select><div className="form-grid"><input aria-label="排班开始" type="time" value={shiftForm.start} onChange={e=>setShiftForm({...shiftForm,start:e.target.value})}/><input aria-label="排班结束" type="time" value={shiftForm.end} onChange={e=>setShiftForm({...shiftForm,end:e.target.value})}/></div><button className="btn" disabled={busy||!shiftForm.event||!shiftForm.staff} onClick={()=>void act(()=>api(`/admin/service-events/${shiftForm.event}/shifts`,{body:{staff_id:shiftForm.staff,start_at:shiftForm.start,end_at:shiftForm.end}}),"排班已添加")}>保存排班</button></details>
    <label>停诊原因（停诊时必填，将通知受影响用户）</label><input value={reason} onChange={e=>setReason(e.target.value)}/>
    {data.events.map(e=><div className="card" key={e.id}><h3>{e.title}</h3><p>{e.service_date} · {{draft:"草稿",published:"已发布",cancelled:"已停诊"}[e.status]||e.status}</p><p>{e.slots.map(s=>`${s.start_at}–${s.end_at}：已约 ${s.confirmed_count} / 保留 ${s.held_count} / 容量 ${s.capacity}`).join("；")}</p>
      <h4>人员排班</h4>{e.shifts.map(s=><p key={s.id}>{s.display_name} {s.start_at}–{s.end_at} {e.status==="draft"&&<button className="btn btn-ghost" disabled={busy} onClick={()=>void act(()=>api(`/admin/service-events/${e.id}/shifts/${s.id}`,{method:"DELETE"}),"已移除排班")}>移除</button>}</p>)}
      <div className="option-row">{e.status==="draft"&&<button className="btn btn-primary" disabled={busy} onClick={()=>void act(()=>api(`/admin/service-events/${e.id}/publish`,{method:"POST"}),"活动已发布")}>校验并发布</button>}
      {e.status!=="cancelled"?<button className="btn btn-danger" disabled={busy||reason.trim().length<2} onClick={()=>void act(()=>api(`/admin/service-events/${e.id}/cancel`,{body:{reason}}),"活动已停诊，受影响用户已收到站内通知")}>停诊并通知</button>:<button className="btn" disabled={busy} onClick={()=>void act(()=>api(`/admin/service-events/${e.id}/reopen`,{method:"POST"}),"已恢复为草稿，请重新核对排班")}>恢复为草稿</button>}</div></div>)}
  </div>;
}
