import {useEffect,useState} from "react";
import {api} from "../api";
import {useAuth} from "../auth";
export default function Account(){
 const {me}=useAuth();const[code,setCode]=useState(""),[msg,setMsg]=useState(""),[err,setErr]=useState("");
 const[status,setStatus]=useState<{email_verified:boolean;verification_required:boolean}|null>(null);
 const refresh=()=>api<{email_verified:boolean;verification_required:boolean}>("/auth/me").then(setStatus);
 useEffect(()=>{void refresh().catch(e=>setErr(e.message));},[]);
 async function send(){try{const r=await api<{message:string;dev_code?:string}>("/auth/verification-code",{method:"POST"});setMsg(r.message+(r.dev_code?`（开发测试验证码：${r.dev_code}）`:""));}catch(e){setErr((e as Error).message);}}
 async function verify(){try{await api("/auth/verify-email",{body:{code}});setMsg("邮箱验证成功");await refresh();}catch(e){setErr((e as Error).message);}}
 return <div className="card"><h2>账号与邮箱验证</h2><p>{me?.email}</p><p>{status?.email_verified?"邮箱已验证":"邮箱尚未验证"}</p><p className="muted">{status?.verification_required?"提交工单与预约前需要验证邮箱。":"当前开发演示环境未强制验证邮箱。"}</p>{err&&<div className="error-box">{err}</div>}{msg&&<div className="alert-ok">{msg}</div>}
 {!status?.email_verified&&<><button className="btn" onClick={()=>void send()}>发送验证码</button><label htmlFor="email-code">邮箱验证码</label><input id="email-code" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value)}/><div className="option-row"><button className="btn btn-primary" disabled={!/^\d{6}$/.test(code)} onClick={()=>void verify()}>验证邮箱</button></div></>}</div>;
}
