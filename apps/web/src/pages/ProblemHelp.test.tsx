import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ProblemHelp from "./ProblemHelp";
import { api } from "../api";

const auth = vi.hoisted(() => ({
  me: null as null | { id: string },
  loading: false,
}));
vi.mock("../auth", () => ({ useAuth: () => auth }));
vi.mock("../api", () => ({ api: vi.fn() }));
vi.mock("../components/DeviceSelect", () => ({
  default: () => <div>设备选择</div>,
}));
function LoginDestination() {
  const location = useLocation();
  return (
    <div>
      {location.state?.back}：{location.state?.symptom}
    </div>
  );
}
const open = () =>
  render(
    <MemoryRouter initialEntries={["/help"]}>
      <Routes>
        <Route path="/help" element={<ProblemHelp />} />
        <Route path="/login" element={<LoginDestination />} />
        <Route path="/diagnosis/:id" element={<div>已进入诊断会话</div>} />
      </Routes>
    </MemoryRouter>,
  );
beforeEach(() => {
  auth.me = null;
  vi.mocked(api).mockReset();
});
afterEach(cleanup);

describe("问题求助真实流程", () => {
  it("未登录时携带故障描述进入登录页", async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText("故障描述"), "电脑没有声音");
    await user.click(screen.getByRole("button", { name: "登录并开始排查" }));
    await screen.findByText("/help：电脑没有声音");
    expect(api).not.toHaveBeenCalled();
  });
  it("已登录时创建服务端会话并进入诊断页面", async () => {
    auth.me = { id: "user" };
    vi.mocked(api).mockResolvedValue({ id: "session-1" });
    const user = userEvent.setup();
    open();
    await user.type(
      screen.getByLabelText("故障描述"),
      "电脑连接网络但无法上网",
    );
    await user.click(screen.getByRole("button", { name: "开始智能排查" }));
    await screen.findByText("已进入诊断会话");
    expect(api).toHaveBeenCalledWith("/diagnosis-sessions", {
      body: { symptom_text: "电脑连接网络但无法上网", device_id: null },
    });
  });
  it("创建会话失败保留输入并允许重试", async () => {
    auth.me = { id: "user" };
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("服务暂时不可用"))
      .mockResolvedValueOnce({ id: "session-2" });
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText("故障描述"), "电脑启动很慢");
    await user.click(screen.getByRole("button", { name: "开始智能排查" }));
    await screen.findByRole("alert");
    expect(
      (screen.getByLabelText("故障描述") as HTMLTextAreaElement).value,
    ).toBe("电脑启动很慢");
    await user.click(screen.getByRole("button", { name: "开始智能排查" }));
    await screen.findByText("已进入诊断会话");
  });
});
