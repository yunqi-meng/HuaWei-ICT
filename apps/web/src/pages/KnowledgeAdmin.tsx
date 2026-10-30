import {useEffect,useState} from "react";
import {api} from "../api";
import {useAuth} from "../auth";
interface Submission{id:string;kind:string;entity_id:string|null;title:string;payload:Record<string,unknown>;status:string;author_id:string;review_note:string;version_id:string|null}
interface Version{id:string;title:string;version_id:string;version_no:number;status:string}
interface Data{submissions:Submission[];guides:Version[];flows:Version[]}
export default function KnowledgeAdmin(){
  const {me,hasRole}=useAuth();
  const [data,setData]=useState<Data>({submissions:[],guides:[],flows:[]});
  const [form,setForm]=useState({kind:"guide",title:"",category:"network",content:"",source_title:"",source_url:"",graph:"",keywords:"",privacy_reviewed:false});
  const [editing,setEditing]=useState<Submission|null>(null),[note,setNote]=useState("");
  const [err,setErr]=useState(""),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
  const refresh=()=>api<Data>("/admin/content").then(setData);
  useEffect(()=>{void refresh().catch(e=>setErr(e.message));},[]);
  async function act(fn:()=>Promise<unknown>,message:string){setBusy(true);setErr("");try{await fn();await refresh();setMsg(message);}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
  async function save(){
    const payload={...(editing?.payload||{}),category:form.category,content:form.content,
      source_refs:[{title:form.source_title,url:form.source_url}],applicability:{os_family:"windows",os_version_range:"11",risk_level:"observe",symptom_tags:[form.category]},
      ...(form.kind==="flow"?{graph:JSON.parse(form.graph),symptom_keywords:form.keywords.split(/[，,\n]/).map(s=>s.trim()).filter(Boolean)}:{}),privacy_reviewed:form.privacy_reviewed};
    await api(editing?`/admin/content/${editing.id}`:"/admin/content",{method:editing?"PUT":"POST",body:{kind:form.kind,title:form.title,entity_id:editing?.entity_id||null,payload}});
    setEditing(null);setForm({...form,title:"",content:"",graph:""});
  }
  function edit(s:Submission){const refs=s.payload.source_refs as {title:string;url:string}[]|undefined;setEditing(s);setForm({kind:s.kind,title:s.title,category:String(s.payload.category||"network"),content:String(s.payload.content||""),source_title:refs?.[0]?.title||"",source_url:refs?.[0]?.url||"",graph:s.payload.graph?JSON.stringify(s.payload.graph,null,2):"",keywords:(s.payload.symptom_keywords as string[]||[]).join("，"),privacy_reviewed:Boolean(s.payload.privacy_reviewed)});}
  if(!hasRole("admin","reviewer"))return <div className="error-box">需要知识编审权限</div>;
  return <div><h2>知识与流程编审</h2><p>作者提交后由另一位审核员审核。发布产生不可变版本；恢复旧内容也需重新审核。</p>{err&&<div className="error-box" role="alert">{err}</div>}{msg&&<div className="alert-ok">{msg}</div>}
    <div className="card"><h3>{editing?"编辑草稿":"创建草稿"}</h3><label>内容类型</label><select disabled={Boolean(editing)} value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="guide">图文指南</option><option value="flow">排障流程</option></select>
      <label>标题</label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><label>分类</label><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{["network","audio","display","performance","app"].map(c=><option key={c}>{c}</option>)}</select>
      <label>来源标题</label><input value={form.source_title} onChange={e=>setForm({...form,source_title:e.target.value})}/><label>来源链接（HTTPS）</label><input type="url" value={form.source_url} onChange={e=>setForm({...form,source_url:e.target.value})}/>
      {form.kind==="guide"?<><label>正文（包括适用环境、操作、风险、验证、回退）</label><textarea rows={10} value={form.content} onChange={e=>setForm({...form,content:e.target.value})}/></>:<><label>症状关键词（逗号分隔）</label><input value={form.keywords} onChange={e=>setForm({...form,keywords:e.target.value})}/><label>流程图定义</label><p className="small muted">面向流程维护人员：使用 entry / nodes / options 定义节点，发布时检查可达性、循环、风险与验证。</p><textarea className="code-editor" rows={16} value={form.graph} onChange={e=>setForm({...form,graph:e.target.value})}/></>}
      <label className="checkbox-label"><input type="checkbox" checked={form.privacy_reviewed} onChange={e=>setForm({...form,privacy_reviewed:e.target.checked})}/>已检查正文中不含可识别用户的资料（维修候选必选）</label>
      <div className="option-row"><button className="btn btn-primary" disabled={busy||!form.title} onClick={()=>void act(save,"草稿已保存")}>保存草稿</button><button className="btn" onClick={()=>setEditing(null)}>新建另一份草稿</button></div>
    </div>
    <label>审核意见或下架原因</label><textarea rows={2} value={note} onChange={e=>setNote(e.target.value)}/>
    {data.submissions.map(s=><div className="card" key={s.id}><h3>{s.title}</h3><p>{{draft:"草稿",pending:"待审核",published:"已发布",rejected:"已退回"}[s.status]||s.status} · {s.kind==="flow"?"流程":"指南"}</p><details><summary>查看内容与证据</summary><pre className="content-preview">{s.kind==="flow"?JSON.stringify(s.payload.graph,null,2):String(s.payload.content||"")}</pre><p>来源：{JSON.stringify(s.payload.source_refs)}</p></details>{s.review_note&&<p>审核意见：{s.review_note}</p>}
      <div className="option-row">{["draft","rejected"].includes(s.status)&&s.author_id===me?.id&&<><button className="btn" onClick={()=>edit(s)}>编辑</button><button className="btn btn-primary" disabled={busy} onClick={()=>void act(()=>api(`/admin/content/${s.id}/submit`,{method:"POST"}),"已提交审核")}>提交审核</button></>}
      {s.status==="pending"&&s.author_id!==me?.id&&<><button className="btn btn-primary" disabled={busy||note.length<2} onClick={()=>void act(()=>api(`/admin/content/${s.id}/review`,{body:{approve:true,note}}),"审核通过并发布，索引任务已入队")}>批准发布</button><button className="btn btn-danger" disabled={busy||note.length<2} onClick={()=>void act(()=>api(`/admin/content/${s.id}/review`,{body:{approve:false,note}}),"已退回修改")}>退回修改</button></>}
      {(s.status==="published"||s.author_id!==me?.id)&&<button className="btn" disabled={busy} onClick={()=>void act(()=>api(`/admin/content/${s.id}/copy`,{method:"POST"}),"已复制为你的新草稿，需编辑并重新审核")}>接续编辑为新草稿</button>}</div></div>)}
    <h3>已存版本</h3>{[...data.guides.map(v=>({...v,kind:"knowledge"})),...data.flows.map(v=>({...v,kind:"flows"}))].map(v=><div className="card" key={v.version_id}><strong>{v.title}</strong><p>v{v.version_no} · {v.status}</p><div className="option-row">{v.kind==="knowledge"&&v.status==="published"&&<button className="btn" disabled={busy} onClick={()=>void act(()=>api(`/admin/knowledge/${v.version_id}/reindex`,{method:"POST"}),"已加入索引队列；向量服务未配置时仍使用 BM25")}>重建索引</button>}{v.status!=="withdrawn"&&hasRole("admin")&&<button className="btn btn-danger" disabled={busy} onClick={()=>void act(()=>api(`/admin/${v.kind}/${v.version_id}/withdraw`,{method:"POST"}),"版本已撤回")}>安全撤回此版本</button>}</div></div>)}
  </div>;
}
