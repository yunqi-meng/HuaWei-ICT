import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { hardwareNavigation, navigation, routeLabel, type NavigationItem } from "../navigation";
import { useTheme } from "../hooks/useTheme";
import Icon from "./Icon";
import CommandPalette from "./CommandPalette";

export default function WorkspaceNav() {
  const {me,loading,logout,hasRole}=useAuth();
  const {pathname}=useLocation();
  const {theme,toggleTheme}=useTheme();
  const [open,setOpen]=useState(false);
  const [command,setCommand]=useState(false);
  const [leaving,setLeaving]=useState(false);
  const [error,setError]=useState("");
  const [online,setOnline]=useState(navigator.onLine);
  const [scrolled,setScrolled]=useState(false);
  const [mobile,setMobile]=useState(()=>window.matchMedia?.("(max-width: 1080px)").matches??false);
  const sidebar=useRef<HTMLElement>(null);
  const items=navigation.filter(item=>!item.roles||hasRole(...item.roles));
  const commands:NavigationItem[]=[...items,...hardwareNavigation.slice(1).map(item=>({...item,description:"硬件数据与参考规格",icon:"chip" as const,group:"探索与求助" as const}))];
  useEffect(()=>{setOpen(false);setError("");},[pathname]);
  useEffect(()=>{
    const media=window.matchMedia?.("(max-width: 1080px)");
    const resize=()=>setMobile(media?.matches??false);
    media?.addEventListener("change",resize);
    const connected=()=>setOnline(navigator.onLine);
    const scroll=()=>setScrolled(window.scrollY>650);
    const shortcuts=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setOpen(false);setCommand(value=>!value);}};
    window.addEventListener("online",connected);window.addEventListener("offline",connected);
    window.addEventListener("scroll",scroll,{passive:true});window.addEventListener("keydown",shortcuts);
    return ()=>{media?.removeEventListener("change",resize);window.removeEventListener("online",connected);window.removeEventListener("offline",connected);window.removeEventListener("scroll",scroll);window.removeEventListener("keydown",shortcuts);};
  },[]);
  useEffect(()=>{
    if(!mobile||!open)return;
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const elements=()=>Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')??[]);
    elements()[0]?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setOpen(false);}
      if(event.key==="Tab"){
        const controls=elements(),first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener("keydown",keydown);
    return ()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",keydown);if(previous?.isConnected)previous.focus();};
  },[mobile,open]);
  return <>
    {open&&mobile&&<button className="sidebar-backdrop" aria-label="关闭导航遮罩" onClick={()=>setOpen(false)}/>}
    <aside ref={sidebar} id="workspace-navigation" className={`workspace-sidebar ${open?"is-open":""}`} aria-label="工作空间导航" aria-hidden={mobile&&!open?true:undefined}>
      <Link to="/" className="workspace-brand" aria-label="知修首页"><span className="workspace-brand-mark"><Icon name="chip" size={24}/></span><span>知修<small>校园电脑服务工作空间</small></span></Link>
      <button className="sidebar-search" onClick={()=>{setOpen(false);setCommand(true);}}><Icon name="search" size={17}/><span>快速跳转</span><kbd>Ctrl K</kbd></button>
      <nav aria-label="主导航" className="workspace-navigation">
        {(["探索与求助","我的空间","服务管理"] as const).map(group=>{
          const links=items.filter(item=>item.group===group);
          if(!links.length)return null;
          return <div className="nav-group" key={group}><div className="nav-group-label">{group}</div>{links.map(item=><NavLink key={item.to} end={item.to==="/"||item.to==="/admin"} to={item.to} className={({isActive})=>`workspace-link ${isActive?"is-active":""}`}><Icon name={item.icon} size={18}/><span>{item.label}</span><span className="nav-active-marker"/></NavLink>)}</div>;
        })}
      </nav>
      <div className="sidebar-bottom"><span className="sidebar-mini-icon"><Icon name="shield" size={18}/></span><div><strong>有步骤，也有后援</strong><span>自助排查 · 人工接续</span></div></div>
    </aside>
    <header className="app-header workspace-header">
      <div className="workspace-topbar">
        <button className="btn btn-icon workspace-menu" aria-label={open?"收起导航":"展开导航"} aria-expanded={open} aria-controls="workspace-navigation" onClick={()=>setOpen(value=>!value)}><Icon name={open?"close":"menu"}/></button>
        <div className="workspace-breadcrumb"><Link to="/">知修工作空间</Link><Icon name="chevron" size={14}/><span>{routeLabel(pathname)}</span></div>
        <div className="workspace-tools">
          <button className="topbar-search" aria-label="搜索功能与页面" aria-keyshortcuts="Control+K Meta+K" onClick={()=>setCommand(true)}><Icon name="search" size={17}/><span>搜索功能</span><kbd>Ctrl K</kbd></button>
          <span className={`network-status ${online?"":"is-offline"}`} title={online?"浏览器网络连接正常，不代表外部服务状态":"网络已断开，连接恢复后可重试"}><span/>{online?"网络已连接":"离线"}</span>
          <button className="btn btn-icon theme-toggle" aria-label={theme==="light"?"切换深色主题":"切换浅色主题"} onClick={toggleTheme}><Icon name={theme==="light"?"moon":"sun"} size={18}/></button>
          {loading?<span className="muted small">加载中</span>:me?<>
            <NavLink to="/notifications" className="btn btn-icon" aria-label="站内通知"><Icon name="bell" size={18}/></NavLink>
            <Link to="/my/account" className="workspace-account"><span className="avatar">{me.display_name.slice(0,1)}</span><span>{me.display_name}</span></Link>
            <button className="workspace-logout" disabled={leaving} onClick={async()=>{setLeaving(true);setError("");try{await logout();}catch{setError("退出失败，请重试。");}finally{setLeaving(false);}}}>{leaving?"退出中…":"退出"}</button>
          </>:<Link to="/login" state={{back:pathname}} className="btn btn-primary nav-login">登录 / 注册<Icon name="arrow" size={15}/></Link>}
        </div>
      </div>
      {pathname.startsWith("/hardware")&&<nav className="secondary-nav" aria-label="硬件相关功能">{hardwareNavigation.map(item=><NavLink end key={item.to} to={item.to}>{item.label}</NavLink>)}</nav>}
      {error&&<div className="nav-error" role="alert">{error}</div>}
    </header>
    {command&&<CommandPalette items={commands} onClose={()=>setCommand(false)}/>}
    {scrolled&&<button className="back-to-top btn btn-icon" aria-label="回到顶部" onClick={()=>window.scrollTo({top:0,behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"})}><Icon name="up"/></button>}
  </>;
}
