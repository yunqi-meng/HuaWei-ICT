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
    <nav className="topnav">
      <Link className="brand" to="/">知修</Link>
      <Link to="/help">🔧 问题求助</Link>
      <Link to="/perf">📊 性能对比</Link>
      <Link to="/quality">🔨 做工对比</Link>
      <Link to="/guides" className="small">指南</Link>
      {me && <Link to="/my/tickets">我的服务</Link>}
      {me && <Link to="/my/devices">我的设备</Link>}
      {me && <Link to="/notifications">通知</Link>}
      {hasRole("staff", "admin") && <Link to="/staff">维修工作台</Link>}
      {hasRole("admin","dispatcher") && <Link to="/admin">运营后台</Link>}
      {hasRole("admin","dispatcher") && <Link to="/admin/scheduling">活动排班</Link>}
      {hasRole("admin","reviewer") && <Link to="/admin/knowledge">知识编审</Link>}
      {hasRole("admin") && <Link to="/admin/system">系统管理</Link>}
      <span className="spacer" />
      {me ? (
        <>
          <Link className="small" to="/my/account">{me.display_name}</Link>
          <button className="btn btn-ghost" onClick={() => void logout()}>退出</button>
        </>
      ) : (
        <Link to="/login">登录 / 注册</Link>
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
