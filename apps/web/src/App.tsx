import { Link, Navigate, Route, Routes } from "react-router-dom";
import {useEffect,useState} from "react";
import {api} from "./api";
import { useAuth } from "./auth";
import Admin from "./pages/Admin";
import Diagnosis from "./pages/Diagnosis";
import GuideDetail from "./pages/GuideDetail";
import Guides from "./pages/Guides";
import Home from "./pages/Home";
import Login from "./pages/Login";
import MyTickets from "./pages/MyTickets";
import NewAppointment from "./pages/NewAppointment";
import StaffWorkbench from "./pages/StaffWorkbench";
import TicketDetail from "./pages/TicketDetail";
import Devices from "./pages/Devices";
import Notifications from "./pages/Notifications";
import SchedulingAdmin from "./pages/SchedulingAdmin";
import KnowledgeAdmin from "./pages/KnowledgeAdmin";
import SystemAdmin from "./pages/SystemAdmin";
import Account from "./pages/Account";
import HardwareRankings from "./pages/HardwareRankings";
import HardwareDatabase from "./pages/HardwareDatabase";
import HardwareCompare from "./pages/HardwareCompare";
import HardwareDetail from "./pages/HardwareDetail";
import ProblemHelp from "./pages/ProblemHelp";
import PerformanceCompare from "./pages/PerformanceCompare";
import BuildQuality from "./pages/BuildQuality";

function TopNav() {
  const { me, logout, hasRole } = useAuth();
  return (
    <nav className="topnav" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", position: "sticky", top: 0, zIndex: 100 }}>
      {/* 房子 Logo */}
      <Link to="/" title="回到首页" style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 42, height: 42, borderRadius: 12,
        background: "linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)",
        color: "#fff", fontSize: 22, textDecoration: "none",
        boxShadow: "0 2px 8px rgba(255,107,53,0.3)",
        transition: "transform 0.15s, box-shadow 0.15s",
        flexShrink: 0,
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.1)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 14px rgba(255,107,53,0.4)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(255,107,53,0.3)"; }}
      >🏠</Link>
      {/* 品牌文字 */}
      <span style={{ fontWeight: 800, fontSize: 17, color: "#2d2d2d", marginLeft: 4, marginRight: 8 }}>知修</span>

      {/* 主导航按钮 */}
      {[
        { to: "/help", icon: "🔧", label: "问题求助" },
        { to: "/perf", icon: "📊", label: "性能对比" },
        { to: "/quality", icon: "🔨", label: "做工对比" },
      ].map(item => (
        <Link key={item.to} to={item.to} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 18px", borderRadius: 10,
          background: "#f4f6f8", color: "#444",
          textDecoration: "none", fontSize: 14, fontWeight: 500,
          border: "1px solid transparent",
          transition: "all 0.15s",
        }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "#ff6b35";
            el.style.color = "#fff";
            el.style.boxShadow = "0 3px 10px rgba(255,107,53,0.3)";
            el.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "#f4f6f8";
            el.style.color = "#444";
            el.style.boxShadow = "none";
            el.style.transform = "translateY(0)";
          }}
        >{item.icon} {item.label}</Link>
      ))}

      <span className="spacer" style={{ flex: 1 }} />
      {me && <Link to="/my/tickets" className="small">我的服务</Link>}
      {me && <Link to="/notifications" className="small">通知</Link>}
      {hasRole("staff", "admin") && <Link to="/staff" className="small">维修台</Link>}
      {hasRole("admin","dispatcher") && <Link to="/admin" className="small">后台</Link>}
      {me ? (
        <>
          <Link className="small" to="/my/account">{me.display_name}</Link>
          <button className="btn btn-ghost" onClick={() => void logout()}>退出</button>
        </>
      ) : (
        <Link to="/login" style={{
          padding: "8px 20px", borderRadius: 10,
          background: "linear-gradient(135deg, #667eea, #764ba2)",
          color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 500,
        }}>登录 / 注册</Link>
      )}
    </nav>
  );
}

export default function App() {
  const [demo,setDemo]=useState(false);
  useEffect(()=>{api<{demo:boolean}>("/public-config").then(c=>setDemo(c.demo)).catch(()=>undefined);},[]);
  return (
    <>
      <TopNav />
      {demo&&<div className="demo-banner">本地开发演示 · 示例账号与知识用于流程演示，示例审核字段不代表实际人工审核完成</div>}
      <div className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/help" element={<ProblemHelp />} />
          <Route path="/help/booking" element={<NewAppointment />} />
          <Route path="/perf" element={<PerformanceCompare />} />
          <Route path="/perf/desktop" element={<PerformanceCompare />} />
          <Route path="/perf/mobile" element={<PerformanceCompare />} />
          <Route path="/perf/phone" element={<PerformanceCompare />} />
          <Route path="/quality" element={<BuildQuality />} />
          <Route path="/quality/desktop" element={<BuildQuality />} />
          <Route path="/quality/mobile" element={<BuildQuality />} />
          <Route path="/guides" element={<Guides />} />
          <Route path="/guides/:id" element={<GuideDetail />} />
          <Route path="/hardware" element={<HardwareDatabase />} />
          <Route path="/hardware/rankings" element={<HardwareRankings />} />
          <Route path="/hardware/compare" element={<HardwareCompare />} />
          <Route path="/hardware/:id" element={<HardwareDetail />} />
          <Route path="/diagnosis/:id" element={<Diagnosis />} />
          <Route path="/appointments/new" element={<NewAppointment />} />
          <Route path="/my/tickets" element={<MyTickets />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route path="/staff" element={<StaffWorkbench />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/my/devices" element={<Devices />} />
          <Route path="/my/account" element={<Account />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/admin/scheduling" element={<SchedulingAdmin />} />
          <Route path="/admin/knowledge" element={<KnowledgeAdmin />} />
          <Route path="/admin/system" element={<SystemAdmin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}
