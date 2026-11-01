import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  TopNav,
  AppFooter,
  RequireAuth,
  RouteEffects,
  PageErrorBoundary,
} from "./components/AppLayout";
import { LoadingState } from "./components/AsyncState";
import { api } from "./api";
import { useAuth } from "./auth";
const Admin = lazy(() => import("./pages/Admin"));
const Diagnosis = lazy(() => import("./pages/Diagnosis"));
const GuideDetail = lazy(() => import("./pages/GuideDetail"));
const Guides = lazy(() => import("./pages/Guides"));
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const MyTickets = lazy(() => import("./pages/MyTickets"));
const NewAppointment = lazy(() => import("./pages/NewAppointment"));
const StaffWorkbench = lazy(() => import("./pages/StaffWorkbench"));
const TicketDetail = lazy(() => import("./pages/TicketDetail"));
const Devices = lazy(() => import("./pages/Devices"));
const Notifications = lazy(() => import("./pages/Notifications"));
const SchedulingAdmin = lazy(() => import("./pages/SchedulingAdmin"));
const KnowledgeAdmin = lazy(() => import("./pages/KnowledgeAdmin"));
const SystemAdmin = lazy(() => import("./pages/SystemAdmin"));
const Account = lazy(() => import("./pages/Account"));
const HardwareRankings = lazy(() => import("./pages/HardwareRankings"));
const HardwareDatabase = lazy(() => import("./pages/HardwareDatabase"));
const HardwareCompare = lazy(() => import("./pages/HardwareCompare"));
const HardwareDetail = lazy(() => import("./pages/HardwareDetail"));
const ProblemHelp = lazy(() => import("./pages/ProblemHelp"));
const PerformanceCompare = lazy(() => import("./pages/PerformanceCompare"));
const BuildQuality = lazy(() => import("./pages/BuildQuality"));

export default function App() {
  const location = useLocation();
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    api<{ demo: boolean }>("/public-config")
      .then((c) => setDemo(c.demo))
      .catch(() => undefined);
  }, []);
  return (
    <>
      <a className="skip-link" href="#main-content">
        跳转到主要内容
      </a>
      <RouteEffects />
      <TopNav />
      {demo && (
        <div className="demo-banner">
          本地演示环境 · 示例账号与知识仅用于体验流程
        </div>
      )}
      <main className="container" id="main-content">
        <PageErrorBoundary key={location.pathname}>
          <Suspense fallback={<LoadingState />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/help" element={<ProblemHelp />} />
              <Route
                path="/help/booking"
                element={
                  <RequireAuth>
                    <NewAppointment />
                  </RequireAuth>
                }
              />
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
              <Route
                path="/diagnosis/:id"
                element={
                  <RequireAuth>
                    <Diagnosis />
                  </RequireAuth>
                }
              />
              <Route
                path="/appointments/new"
                element={
                  <RequireAuth>
                    <NewAppointment />
                  </RequireAuth>
                }
              />
              <Route
                path="/my/tickets"
                element={
                  <RequireAuth>
                    <MyTickets />
                  </RequireAuth>
                }
              />
              <Route
                path="/tickets/:id"
                element={
                  <RequireAuth>
                    <TicketDetail />
                  </RequireAuth>
                }
              />
              <Route
                path="/staff"
                element={
                  <RequireAuth roles={["staff", "admin"]}>
                    <StaffWorkbench />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireAuth roles={["admin", "dispatcher"]}>
                    <Admin />
                  </RequireAuth>
                }
              />
              <Route
                path="/my/devices"
                element={
                  <RequireAuth>
                    <Devices />
                  </RequireAuth>
                }
              />
              <Route
                path="/my/account"
                element={
                  <RequireAuth>
                    <Account />
                  </RequireAuth>
                }
              />
              <Route
                path="/notifications"
                element={
                  <RequireAuth>
                    <Notifications />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/scheduling"
                element={
                  <RequireAuth roles={["admin", "dispatcher"]}>
                    <SchedulingAdmin />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/knowledge"
                element={
                  <RequireAuth roles={["admin", "reviewer"]}>
                    <KnowledgeAdmin />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/system"
                element={
                  <RequireAuth roles={["admin"]}>
                    <SystemAdmin />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </PageErrorBoundary>
      </main>
      <AppFooter />
    </>
  );
}
