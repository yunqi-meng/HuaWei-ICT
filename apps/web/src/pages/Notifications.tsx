import { useEffect,useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
interface Notice{id:string;title:string;body:string;link:string;read_at:string|null;created_at:string}
export default function Notifications(){
  const [items,setItems]=useState<Notice[]>([]),[err,setErr]=useState("");
  const refresh=()=>api<Notice[]>("/notifications").then(setItems).catch(e=>setErr(e.message));
  useEffect(()=>{void refresh();const t=window.setInterval(()=>void refresh(),20000);return()=>clearInterval(t);},[]);
  return <div><h2>站内通知</h2>{err&&<div className="error-box">{err}</div>}{items.length===0&&<p>暂无通知</p>}
  {items.map(n=><div className="card" key={n.id}><h3>{n.title} {!n.read_at&&<span className="badge badge-warn">未读</span>}</h3><p>{n.body}</p><p className="small muted">{new Date(n.created_at).toLocaleString("zh-CN")}</p><div className="option-row">
    {n.link&&<Link className="btn" to={n.link}>查看详情</Link>}{!n.read_at&&<button className="btn" onClick={()=>void api(`/notifications/${n.id}/read`,{method:"POST"}).then(refresh).catch(e=>setErr(e.message))}>标记已读</button>}</div></div>)}</div>;
}
