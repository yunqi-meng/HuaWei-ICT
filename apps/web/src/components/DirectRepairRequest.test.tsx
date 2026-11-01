import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import DirectRepairRequest from "./DirectRepairRequest";
import { api } from "../api";

vi.mock("../api", () => ({
  api: vi.fn(),
  newClientMessageId: () => "request-1",
}));
vi.mock("./DeviceSelect", () => ({ default: () => <div>选择设备</div> }));
function Destination() {
  const location = useLocation();
  return <p>{location.search}</p>;
}
const open = () =>
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<DirectRepairRequest />} />
        <Route path="/appointments/new" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(cleanup);

describe("直接预约入口", () => {
  it("无需已有工单也能提交问题，随后进入对应工单的预约选择", async () => {
    vi.mocked(api).mockResolvedValue({ id: "ticket-1" });
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText("一句话描述问题"), "电脑无法开机");
    await user.click(
      screen.getByRole("button", { name: "提交并选择预约时段" }),
    );
    await screen.findByText("?ticketId=ticket-1");
    expect(api).toHaveBeenCalledWith("/tickets", {
      body: {
        title: "电脑无法开机",
        description: "",
        device_id: null,
        idempotency_key: "request-1",
      },
    });
  });
  it("失败重试复用幂等键", async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("网络暂时不可用"))
      .mockResolvedValueOnce({ id: "ticket-2" });
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText("一句话描述问题"), "电脑屏幕异常");
    await user.click(
      screen.getByRole("button", { name: "提交并选择预约时段" }),
    );
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: "提交并选择预约时段" }),
    );
    await screen.findByText("?ticketId=ticket-2");
    expect(vi.mocked(api).mock.calls[0][1]?.body).toEqual(
      vi.mocked(api).mock.calls[1][1]?.body,
    );
  });
  it("请求未完成时，连续点击只提交一次", async () => {
    vi.mocked(api).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText("一句话描述问题"), "电脑无法开机");
    await user.dblClick(
      screen.getByRole("button", { name: "提交并选择预约时段" }),
    );
    expect(api).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("button", { name: "正在提交…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
