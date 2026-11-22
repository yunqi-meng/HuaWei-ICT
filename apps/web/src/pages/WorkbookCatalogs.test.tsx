import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HardwareCatalog from "./HardwareCatalog";
import Motherboards from "./Motherboards";

afterEach(cleanup);
const open = (kind: "chips" | "boards", query = "") => render(<MemoryRouter initialEntries={[`/hardware/${kind === "chips" ? "catalog" : "motherboards"}${query}`]}>
  {kind === "chips" ? <HardwareCatalog /> : <Motherboards />}
</MemoryRouter>);

describe("工作簿硬件资料", () => {
  it("无跑分 CPU 可查询，但开启有成绩筛选后不参与", () => {
    open("chips", "?q=A4-3300");
    expect(screen.getByRole("heading", { name: "A4-3300" })).toBeTruthy();
    expect(screen.getByText("仅规格索引")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "仅看有参考跑分" }));
    expect(screen.getByRole("heading", { name: "未找到匹配型号" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "A4-3300" })).toBeNull();
  });

  it("显存带宽与速度按正确单位展示，缺失跑分不被理论分替代", () => {
    open("chips", "?type=gpu&q=M4 Max");
    expect(screen.getByRole("heading", { name: "M4 Max" })).toBeTruthy();
    expect(screen.getByText("546 GB/s")).toBeTruthy();
    expect(screen.getByText("8.5 Gbps")).toBeTruthy();
    expect(screen.getByText("共享")).toBeTruthy();
    expect(screen.getByText("仅规格索引")).toBeTruthy();
    expect(screen.queryByText(/bit/)).toBeNull();
  });

  it("规格对比保留筛选外已选项，且拒绝 CPU 与 GPU 混合比较", () => {
    open("chips", "?q=Core Ultra 9 285K");
    fireEvent.click(screen.getByRole("button", { name: "加入对比 Core Ultra 9 285K" }));
    fireEvent.click(screen.getByRole("button", { name: "GPU" }));
    fireEvent.click(screen.getAllByRole("button", { name: /^加入对比/ })[0]);
    expect(screen.getByRole("alert").textContent).toContain("同类硬件");
    expect(screen.getByRole("complementary", { name: "已选对比型号" }).textContent).toContain("Core Ultra 9 285K");
    fireEvent.click(screen.getByRole("button", { name: "清空选择" }));
    expect(screen.queryByRole("complementary", { name: "已选对比型号" })).toBeNull();
  });

  it("主板支持芯片组和内存联合筛选，并回退缺失图片", () => {
    open("boards");
    fireEvent.change(screen.getByRole("combobox", { name: "主板芯片组" }), { target: { value: "Z890" } });
    fireEvent.change(screen.getByRole("combobox", { name: "主板内存类型" }), { target: { value: "DDR5" } });
    expect(screen.getByRole("heading", { name: "华硕ROG STRIX Z890-A GAMING WIFI S吹雪" })).toBeTruthy();
    const photo = screen.getByAltText("华硕ROG STRIX Z890-A GAMING WIFI S吹雪 表内产品缩略图");
    const card = photo.closest("article")!;
    fireEvent.error(photo);
    expect(within(card).getByText("暂无表内图片")).toBeTruthy();
    expect(within(card).getByText(/3,599/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("5 款主板");
  });

  it("主板比较不受搜索影响，历史价格与缺失值保留原意", () => {
    open("boards");
    fireEvent.click(screen.getAllByRole("button", { name: /^加入对比/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /^加入对比/ })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索主板或芯片组" }), { target: { value: "绝无此型号" } });
    fireEvent.click(screen.getByRole("button", { name: "对比所选" }));
    const dialog = screen.getByRole("dialog", { name: "硬件规格对比" });
    expect(within(dialog).getByText("华硕ROG STRIX Z890-A GAMING WIFI S吹雪")).toBeTruthy();
    expect(within(dialog).getByText("微星MPG Z890 EDGE TI WIFI")).toBeTruthy();
    expect(within(dialog).getByText("¥3,599（历史参考）")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭弹窗" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("芯片组预告默认隐藏，明确选择后才展示", () => {
    open("boards", "?view=chipsets&q=Z990");
    expect(screen.queryByRole("heading", { name: "Z990" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "包含表内预告型号" }));
    expect(screen.getByRole("heading", { name: "Z990" })).toBeTruthy();
    expect(screen.getByText("预告 · 未确认")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "查看 Z990 主板" })).toBeNull();
  });

  it("最多选择四款主板；切换筛选和分页保留选择", () => {
    open("boards");
    const buttons = screen.getAllByRole("button", { name: /^加入对比/ });
    buttons.slice(0, 5).forEach(button => fireEvent.click(button));
    expect(screen.getByRole("alert").textContent).toContain("最多对比 4 款");
    expect(screen.getByRole("complementary", { name: "已选对比型号" }).textContent).toContain("4 / 4");
    fireEvent.click(screen.getByRole("button", { name: /继续显示/ }));
    expect(screen.getByRole("status").textContent).toContain("48 款");
  });
});
