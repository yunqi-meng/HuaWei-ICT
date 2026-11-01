import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { useResource } from "./useResource";

vi.mock("../api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.mocked(api).mockReset();
});
function Resource({ path }: { path: string | null }) {
  const { data, error, loading, reload } = useResource<{ name: string }>(path);
  return (
    <div>
      <p>{loading ? "加载中" : error || data?.name || "无数据"}</p>
      <button onClick={reload}>重试</button>
    </div>
  );
}

describe("资源请求竞态与失败恢复", () => {
  it("忽略已取消的旧请求，避免快速切换时覆盖当前结果", async () => {
    let resolveOld!: (value: unknown) => void;
    vi.mocked(api)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }) as never,
      )
      .mockResolvedValueOnce({ name: "最新芯片" });
    const view = render(<Resource path="/old" />);
    const signal = vi.mocked(api).mock.calls[0][1]?.signal;
    view.rerender(<Resource path="/new" />);
    await screen.findByText("最新芯片");
    expect(signal?.aborted).toBe(true);
    await act(async () => resolveOld({ name: "过时芯片" }));
    expect(screen.getByText("最新芯片")).toBeTruthy();
    expect(screen.queryByText("过时芯片")).toBeNull();
  });
  it("失败后可重试，成功会清除错误", async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("服务暂时不可用"))
      .mockResolvedValueOnce({ name: "恢复成功" });
    render(<Resource path="/chips" />);
    await screen.findByText("服务暂时不可用");
    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    await screen.findByText("恢复成功");
    expect(screen.queryByText("服务暂时不可用")).toBeNull();
  });
  it("无有效路径时不请求服务端", () => {
    render(<Resource path={null} />);
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByText("无数据")).toBeTruthy();
  });
});
