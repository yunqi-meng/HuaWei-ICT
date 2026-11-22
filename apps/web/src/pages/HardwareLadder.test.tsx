import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { cpuPerfPerWatt, rankedLadderCpus as ladderCpus } from "../data/ladder";
import HardwareLadder from "./HardwareLadder";

vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    BarChart: ({ data, children }: { data: { score: number }[]; children?: ReactNode }) =>
      <div data-testid="ladder-chart" data-score={data[0]?.score}>{children}</div>,
    ResponsiveContainer: Box, Bar: Box, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Cell: () => null,
  };
});

afterEach(cleanup);
const open = () => render(<MemoryRouter><HardwareLadder /></MemoryRouter>);

describe("天梯筛选与每瓦性能", () => {
  it("每瓦性能跟随当前 CPU-Z 指标，图表与首行表格采用相同数值", () => {
    open();
    fireEvent.change(screen.getByRole("combobox", { name: "天梯测试指标" }), { target: { value: "cpuz_single" } });
    fireEvent.click(screen.getByRole("button", { name: "按每瓦性能" }));
    const expected = ladderCpus.filter(c => c.tdp && c.tdp > 0)
      .sort((a, b) => b.cpuz_single / b.tdp! - a.cpuz_single / a.tdp!)[0];
    const firstRow = screen.getByRole("table").querySelector("tbody tr")!;
    expect(firstRow.textContent).toContain(expected.name);
    expect(cpuPerfPerWatt(expected, "cpuz_single")).toBe(expected.cpuz_single / expected.tdp!);
    expect(screen.getByTestId("ladder-chart").getAttribute("data-score"))
      .toBe(String(Math.round(expected.cpuz_single / expected.tdp! * 100) / 100));
    expect(screen.getByRole("heading", { name: "前 15 名 · CPU-Z 单核 / W" })).toBeTruthy();
  });

  it("从 Intel CPU 切换到 GPU 时重置失效品牌筛选", () => {
    open();
    fireEvent.change(screen.getByRole("combobox", { name: "品牌筛选" }), { target: { value: "Intel" } });
    fireEvent.click(screen.getByRole("button", { name: /GPU 显卡/ }));
    expect((screen.getByRole("combobox", { name: "品牌筛选" }) as HTMLSelectElement).value).toBe("");
    expect(within(screen.getByRole("table")).getAllByRole("row").length).toBeGreaterThan(1);
  });
});
