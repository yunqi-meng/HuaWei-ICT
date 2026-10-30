import { useEffect, useRef, useState } from "react";
import { api, uploadImage } from "../api";

interface Attachment { id: string; byte_size: number; created_at: string;can_delete:boolean }
export default function Attachments({ sessionId, ticketId, canUpload=true,onObservation }: {sessionId?:string;ticketId?:string;canUpload?:boolean;onObservation?:(text:string)=>void}) {
  const [items,setItems]=useState<Attachment[]>([]);
  const [preview,setPreview]=useState(false);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [recognized,setRecognized]=useState<Record<string,string>>({});
  const [tool,setTool]=useState<"redact"|"crop">("redact");
  const canvas=useRef<HTMLCanvasElement>(null);
  const drag=useRef<{x:number;y:number}|null>(null);
  const refresh=()=>api<Attachment[]>(`/attachments?${ticketId ? `ticket_id=${ticketId}` : `session_id=${sessionId}`}`).then(setItems).catch(e=>setError(e.message));
  useEffect(()=>{void refresh();},[sessionId,ticketId]);
  async function select(file:File|undefined) {
    if(!file) return;
    setError("");
    if(file.size>8*1024*1024) {setError("图片不得超过 8 MB");return;}
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)){setError("请选择 PNG、JPEG 或 WebP 图片");return;}
    const bitmap=await createImageBitmap(file);
    if(bitmap.width*bitmap.height>24000000){bitmap.close();setError("图片尺寸过大");return;}
    setPreview(true);
    requestAnimationFrame(()=>{const c=canvas.current!;const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);c.getContext("2d")!.drawImage(bitmap,0,0,c.width,c.height);bitmap.close();});
  }
  async function upload() {
    if(!canvas.current) return;
    setBusy(true);setError("");
    try {
      const blob=await new Promise<Blob|null>(r=>canvas.current!.toBlob(r,"image/jpeg",.9));
      if(!blob) throw new Error("图片处理失败");
      const form=new FormData();form.set("file",blob,"截图.jpg");form.set(ticketId?"ticket_id":"session_id",ticketId||sessionId||"");
      await uploadImage(form);setPreview(false);await refresh();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function end(e:React.PointerEvent<HTMLCanvasElement>){
    const c=canvas.current!;if(!drag.current)return;const rect=c.getBoundingClientRect();
    const x=(e.clientX-rect.left)*c.width/rect.width,y=(e.clientY-rect.top)*c.height/rect.height;
    const left=Math.max(0,Math.min(x,drag.current.x)),top=Math.max(0,Math.min(y,drag.current.y));
    const width=Math.min(c.width-left,Math.abs(x-drag.current.x)),height=Math.min(c.height-top,Math.abs(y-drag.current.y));drag.current=null;
    if(width<3||height<3)return;
    const ctx=c.getContext("2d")!;
    if(tool==="redact"){ctx.fillStyle="#111";ctx.fillRect(left,top,width,height);}
    else {const cropped=ctx.getImageData(left,top,width,height);c.width=cropped.width;c.height=cropped.height;c.getContext("2d")!.putImageData(cropped,0,0);}
  }
  return <div className="card"><h4>问题截图</h4><p className="small muted">先裁剪或遮挡姓名、账号、密码与验证码；上传前可预览。图片只向本人及获授权的维修人员开放。</p>
    {error&&<div className="error-box" role="alert">{error}</div>}
    <div className="attachment-grid">{items.map(a=><div key={a.id}><a href={`/api/v1/attachments/${a.id}`} target="_blank" rel="noreferrer"><img loading="lazy" src={`/api/v1/attachments/${a.id}`} alt="已上传的故障截图"/></a>{canUpload&&<button className="btn small" disabled={busy} onClick={()=>{setBusy(true);void api<{text:string;error_codes:string[]}>(`/attachments/${a.id}/recognize`,{body:{consent_to_model:true}}).then(r=>setRecognized({...recognized,[a.id]:r.text+(r.error_codes.length?`\n错误码：${r.error_codes.join("，")}`:"")})).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>同意交由 DeepSeek 识别此图</button>}{recognized[a.id]&&<div><p className="small">识别结果（请核对）：{recognized[a.id]}</p>{onObservation&&<button className="btn" onClick={()=>onObservation(recognized[a.id])}>填入补充说明，核对后再发送</button>}</div>}</div>)}</div>
    {canUpload&&<><label htmlFor={`image-${sessionId||ticketId}`}>添加截图（最大 8 MB）</label><input id={`image-${sessionId||ticketId}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void select(e.target.files?.[0]).catch(err=>setError(err.message))}/>
    {preview&&<div><div className="option-row"><button className="btn" aria-pressed={tool==="redact"} onClick={()=>setTool("redact")}>拖动遮挡隐私</button><button className="btn" aria-pressed={tool==="crop"} onClick={()=>setTool("crop")}>拖动保留裁剪区域</button></div>
      <p className="small">在下图拖出矩形完成操作；需要重做时重新选择图片。</p>
      <canvas ref={canvas} className="image-editor" aria-label="图片裁剪与隐私遮挡预览" onPointerDown={e=>{const c=canvas.current!;c.setPointerCapture(e.pointerId);const r=c.getBoundingClientRect();drag.current={x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};}} onPointerUp={end}/>
      <div className="option-row"><button className="btn btn-primary" disabled={busy} onClick={()=>void upload()}>确认图片已脱敏并上传</button><button className="btn" onClick={()=>setPreview(false)}>取消</button></div></div>}
    {items.some(a=>a.can_delete)&&<details><summary>删除我的附件</summary>{items.filter(a=>a.can_delete).map(a=><button key={a.id} className="btn btn-danger" onClick={()=>void api(`/attachments/${a.id}`,{method:"DELETE"}).then(refresh).catch(e=>setError(e.message))}>删除 {new Date(a.created_at).toLocaleString("zh-CN")}</button>)}</details>}</>}
  </div>;
}
