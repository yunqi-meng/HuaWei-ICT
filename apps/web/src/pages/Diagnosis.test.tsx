import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Diagnosis from "./Diagnosis";
import { api } from "../api";

vi.mock("../api", () => ({
  api: vi.fn(),
  newClientMessageId: () => "message-1",
}));
vi.mock("../components/Attachments", () => ({ default: () => null }));
const session = {
  id: "session-1",
  version: 1,
  state: "HANDOFF",
  facts: {},
  symptom_text: "电脑无法开机",
  symptom_category: "",
  risk_flags: [],
  tried_steps: [],
  messages: [],
  current_step: null,
  handoff_reason: "需要人工检查",
};
const draft = {
  category: "hardware",
  device_desc: "测试电脑",
  user_description: "电脑无法开机",
  confirmed_facts: [],
  tried_steps: [],
  unconfirmed_items: [],
  risk_notes: [],
  handoff_reason: "需要人工检查",
};
let receive: ((event: { data: string }) => void) | undefined;
beforeEach(() => {
  receive = undefined;
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("/handoff-draft") ? draft : session,
  );
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener(_name: string, listener: typeof receive) {
        receive = listener;
      }
      close() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const open = () =>
  render(
    <MemoryRouter initialEntries={["/diagnosis/session-1"]}>
      <Routes>
        <Route path="/diagnosis/:id" element={<Diagnosis />} />
      </Routes>
    </MemoryRouter>,
  );

describe("诊断状态与交接反馈", () => {
  it("交接摘要加载失败时显示错误并恢复按钮", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.endsWith("/handoff-draft")) throw new Error("摘要暂时不可用");
      return session;
    });
    const user = userEvent.setup();
    open();
    await user.click(
      await screen.findByRole("button", { name: "生成交接摘要并提交工单" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "摘要暂时不可用",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "生成交接摘要并提交工单",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("提交失败的原因显示在交接弹窗内，用户可直接修改重试", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/tickets") throw new Error("工单提交失败");
      return path.endsWith("/handoff-draft") ? draft : session;
    });
    const user = userEvent.setup();
    open();
    await user.click(
      await screen.findByRole("button", { name: "生成交接摘要并提交工单" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "确认提交并选择预约时段" }),
    );
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "工单提交失败",
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("旧的 SSE 状态不会覆盖已经收到的新版本", async () => {
    open();
    await screen.findByText("需要人工检查");
    await act(async () =>
      receive?.({
        data: JSON.stringify({ ...session, state: "RESOLVED", version: 5 }),
      }),
    );
    expect(screen.getByText("问题已解决 ✓")).toBeTruthy();
    await act(async () =>
      receive?.({ data: JSON.stringify({ ...session, version: 2 }) }),
    );
    expect(screen.getByText("问题已解决 ✓")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "生成交接摘要并提交工单" }),
    ).toBeNull();
  });
});
