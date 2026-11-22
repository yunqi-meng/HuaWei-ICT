import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon, { type IconName } from "../components/Icon";

const modes = [
  {id:"diagnosis",label:"故障排查",icon:"tool",title:"从现象出发，逐步缩小范围",description:"确认故障电脑与系统，一次完成一个检查，再依据你的反馈继续。",steps:["描述现象","确认环境","逐步检查","验证结果"],to:"/help",action:"开始排查"},
  {id:"hardware",label:"硬件探索",icon:"chip",title:"让型号背后的差异清晰可见",description:"将规格、基准成绩与数据来源放在一起，比较同类硬件的真实差异。",steps:["查找型号","选择指标","并排比较","核对来源"],to:"/hardware/catalog",action:"打开规格库"},
  {id:"service",label:"校园义诊",icon:"calendar",title:"线上留有记录，线下顺畅接续",description:"需要人工帮助时，带上已尝试的步骤，选择可预约的活动与时段。",steps:["提交问题","选择活动","确认预约","现场检查"],to:"/appointments/new",action:"查看预约"},
] as const;
const services: {icon:IconName;title:string;description:string;to:string;action:string;className:string}[] = [
  {icon:"tool",title:"问题排查",description:"描述你遇到的情况，按步骤检查，保留每一次观察与反馈。",to:"/help",action:"开始一次排查",className:"service-diagnosis"},
  {icon:"chart",title:"性能与硬件",description:"从芯片规格到能耗曲线，依据可追溯的资料理解硬件。",to:"/perf",action:"探索性能差异",className:"service-hardware"},
  {icon:"calendar",title:"人工义诊",description:"自助没解决时，让维修志愿者接着帮你检查。",to:"/appointments/new",action:"预约校园服务",className:"service-campus"},
];
export default function Home() {
  const [mode,setMode]=useState(0);
  const [symptom,setSymptom]=useState("");
  const navigate=useNavigate();
  const current=modes[mode];
  return <div className="home-page">
    <section className="workspace-hero">
      <div className="hero-intro"><div className="hero-kicker"><span/>校园电脑服务，触手可及</div>
        <h1>让每一次排查，<br/>都有清晰方向。</h1>
        <p>从故障现象到检查步骤，从硬件资料到校园义诊。<br className="desktop-break"/>把电脑问题放在一个工作空间里，逐一解决。</p>
        <form className="hero-search" onSubmit={event=>{event.preventDefault();navigate("/help",{state:{symptom:symptom.trim()}});}}>
          <Icon name="search" size={20}/><input aria-label="简述电脑问题" placeholder="你的电脑遇到了什么问题？" value={symptom} maxLength={2000} onChange={event=>setSymptom(event.target.value)}/><button type="submit" aria-label="前往问题排查"><Icon name="arrow" size={20}/></button>
        </form>
        <div className="hero-suggestions"><span>也可以直接查看</span><Link to="/guides">常见问题</Link><Link to="/hardware/motherboards">主板与芯片组</Link></div>
      </div>
      <div className="hero-instrument" data-mode={current.id}>
        <div className="instrument-tabs" role="tablist" aria-label="服务路径预览">{modes.map((item,index)=><button key={item.id} id={`service-tab-${item.id}`} role="tab" aria-selected={mode===index} aria-controls="service-preview" tabIndex={mode===index?0:-1} onClick={()=>setMode(index)} onKeyDown={event=>{
          if(["ArrowRight","ArrowLeft","Home","End"].includes(event.key)){event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?2:(mode+(event.key==="ArrowRight"?1:2))%3;setMode(next);document.getElementById(`service-tab-${modes[next].id}`)?.focus();}
        }}><Icon name={item.icon} size={16}/>{item.label}</button>)}</div>
        <div id="service-preview" role="tabpanel" aria-labelledby={`service-tab-${current.id}`} className="instrument-content">
          <div className="device-blueprint" aria-hidden="true"><div className="blueprint-cross cross-one"/><div className="blueprint-cross cross-two"/>
            <svg className="blueprint-traces" viewBox="0 0 360 180" fill="none"><path d="M0 45h80l35 35h50M0 135h80l35-35h50M360 45h-80l-35 35h-50M360 135h-80l-35-35h-50M115 0v36l45 34M245 180v-36l-45-34M180 0v50M180 180v-50"/><circle cx="80" cy="45" r="3"/><circle cx="280" cy="135" r="3"/></svg>
            <span className="blueprint-core"><Icon name={current.icon} size={43}/></span>
          </div>
          <h2>{current.title}</h2><p>{current.description}</p>
          <ol className="instrument-flow">{current.steps.map((step,index)=><li key={step}><span>{index+1}</span>{step}</li>)}</ol>
          <Link to={current.to} className="instrument-action">{current.action}<Icon name="arrow" size={16}/></Link>
        </div>
      </div>
    </section>
    <section className="home-services" aria-labelledby="home-services-title"><div className="section-heading"><div><h2 id="home-services-title">选择你需要的帮助</h2><p className="muted">从了解问题开始，到找到下一步。</p></div><Link to="/my/tickets" className="text-button">继续我的服务<Icon name="arrow" size={15}/></Link></div>
      <div className="service-grid">{services.map(service=><article className={`service-card ${service.className}`} key={service.to}><span className="service-icon"><Icon name={service.icon} size={23}/></span><h3>{service.title}</h3><p>{service.description}</p><Link className="service-action" to={service.to}>{service.action}<Icon name="arrow" size={17}/></Link></article>)}</div>
    </section>
    <section className="quick-access" aria-label="快捷入口">{([
      {to:"/guides",icon:"book",label:"问题指南",desc:"按故障与环境查阅"},
      {to:"/hardware/catalog",icon:"chip",label:"硬件规格",desc:"CPU 与 GPU 完整参数"},
      {to:"/my/devices",icon:"monitor",label:"我的设备",desc:"管理电脑与系统信息"},
      {to:"/my/tickets",icon:"clipboard",label:"服务记录",desc:"继续排查与查看进展"},
    ] as const).map(item=><Link to={item.to} key={item.to}><span className="quick-icon"><Icon name={item.icon} size={20}/></span><div><strong>{item.label}</strong><span>{item.desc}</span></div><Icon name="chevron" size={16}/></Link>)}</section>
    <section className="home-care"><span className="care-icon"><Icon name="shield" size={27}/></span><div><h2>遇到不确定的情况，随时交给人工。</h2><p>保留排查记录，让接续检查更有方向。义诊以实际开放的活动和时段为准。</p></div><Link to="/appointments/new" className="btn">查看校园义诊<Icon name="arrow" size={16}/></Link></section>
  </div>;
}
