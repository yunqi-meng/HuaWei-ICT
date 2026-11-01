import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import PerformanceCompare from "./PerformanceCompare";

vi.mock("recharts",()=>{
  const Box=({children}:{children?:ReactNode})=><div>{children}</div>;
  return {LineChart:Box,ResponsiveContainer:Box,Line:()=>null,XAxis:()=>null,YAxis:()=>null,CartesianGrid:()=>null,Tooltip:()=>null,Legend:()=>null,Brush:()=>null};
});
vi.mock("../components/TierImageViewer",()=>({default:({title}:{title:string})=><div>{title}</div>}));
afterEach(cleanup);
const open=(url:string)=>render(<MemoryRouter initialEntries={[url]}><PerformanceCompare/></MemoryRouter>);
async function loaded(){await screen.findByRole('combobox',{name:'测试项目'});}

describe('SOCPK 性能对比',()=>{
  it('默认打开移动芯片榜单，提供来源并保留桌面数据入口',async()=>{
    open('/perf');await loaded();
    expect(screen.getByRole('button',{name:'手机 / 平板',pressed:true})).toBeTruthy();
    expect(screen.getByRole('link',{name:'核对原始资料 ↗'}).getAttribute('href')).toContain('socpk.com/chart/chip-cpu');
    expect(screen.getByRole('list').textContent).toContain('M4');
    await userEvent.click(screen.getByRole('button',{name:'桌面端'}));
    expect(screen.getByRole('combobox',{name:'测试项目'}).textContent).toContain('Geekbench 7 多核');
  });
  it('恢复分享链接，去掉重复和失效型号，不合并同一 SoC 的不同核心',async()=>{
    open('/perf/phone?mode=curve&dataset=spec26-int&chips=spec26-int:16144,spec26-int:16144,spec26-int:16145,missing');await loaded();
    expect(screen.getByText('2 / 6')).toBeTruthy();
    const table=screen.getByRole('table');
    expect(table.textContent).toContain('Oryon V4 L');
    expect(table.textContent).toContain('Oryon V4 M (4GHz)');
  });
  it('GB6 与 GB7 分开，切换项目清除旧选择并采用新默认曲线',async()=>{
    open('/perf?mode=curve&dataset=cpu-gb6&chips=cpu-gb6:15650');await loaded();
    const select=screen.getByRole('combobox',{name:'测试项目'});
    expect(select.textContent).toContain('Geekbench 6 · 多核');expect(select.textContent).toContain('Geekbench 7 · 多核');
    await userEvent.selectOptions(select,'cpu-gb7');
    expect(screen.getByRole('heading',{name:'同功耗比较'})).toBeTruthy();
    expect(screen.getByRole('table').textContent).not.toContain('Oryon V4');
    expect((screen.getByRole('combobox',{name:'测试项目'}) as HTMLSelectElement).value).toBe('cpu-gb7');
  });
  it('切换到无数据分类不残留旧曲线，并给出可用入口',async()=>{
    open('/perf?mode=curve');await loaded();
    await userEvent.click(screen.getByRole('button',{name:'桌面端'}));
    expect(screen.getByText('该分类暂无能耗曲线')).toBeTruthy();expect(screen.queryByRole('table')).toBeNull();
    await userEvent.click(screen.getByRole('button',{name:'查看笔记本显卡 →'}));
    await screen.findByRole('heading',{name:'同功耗比较'});
    expect(screen.getByRole('combobox',{name:'测试项目'}).textContent).toContain('Time Spy');
  });
  it('最多六条曲线；搜索不移除已选，清空后不自动恢复默认值',async()=>{
    open('/perf?mode=curve&dataset=gpu-snl&component=gpu&chips=');await loaded();
    const buttons=[...document.querySelectorAll<HTMLButtonElement>('.perf-chip-options .chip-option')];
    for(const b of buttons.slice(0,6))await userEvent.click(b);
    expect(buttons[6].disabled).toBe(true);expect(screen.getByText('6 / 6')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox',{name:'搜索能耗芯片'}),{target:{value:'绝无此型号'}});
    expect(screen.getByText('未找到匹配型号')).toBeTruthy();expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(6);
    await userEvent.click(screen.getByRole('button',{name:'清空选择'}));
    expect(screen.queryByRole('table')).toBeNull();expect(screen.getByText('从一个型号开始探索')).toBeTruthy();
  });
  it('功耗超出数据范围时显示缺失值，不伪造零分',async()=>{
    open('/perf?mode=curve&dataset=cpu-gb6');await loaded();
    fireEvent.change(screen.getByRole('spinbutton',{name:'对比功耗 W'}),{target:{value:'9999'}});
    const rows=screen.getByRole('table').querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    for(const row of rows)expect(row.textContent).toContain('—');
  });
  it('分享链接恢复功耗与每瓦视图，笔记本默认采用 80 W',async()=>{
    open('/perf?mode=curve&dataset=cpu-gb6&power=3.7&view=per-watt');await loaded();
    expect((screen.getByRole('spinbutton',{name:'对比功耗 W'}) as HTMLInputElement).value).toBe('3.7');
    expect(screen.getByRole('button',{name:'性能 / 瓦',pressed:true})).toBeTruthy();
    await userEvent.click(screen.getByRole('button',{name:'GPU'}));
    await userEvent.click(screen.getByRole('button',{name:'笔记本'}));
    expect((screen.getByRole('spinbutton',{name:'对比功耗 W'}) as HTMLInputElement).value).toBe('80');
  });
  it('品牌筛选与清空选择不改变榜单顺序，比较可以更换基准',async()=>{
    open('/perf?platform=desktop');
    await userEvent.click(screen.getByRole('button',{name:/加入对比 AMD Ryzen 9 9950X/}));
    await userEvent.click(screen.getByRole('button',{name:/加入对比 Intel Core Ultra 9 285K/}));
    const baseline=screen.getByRole('combobox',{name:'对比基准型号'});
    await userEvent.selectOptions(baseline,'intel-u9-285k');
    expect(within(screen.getByRole('table')).getByText('100%')).toBeTruthy();
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'品牌筛选'}),'AMD');
    expect(screen.getByRole('list').textContent).not.toContain('Intel');
    expect(screen.getByRole('table').textContent).toContain('Intel Core Ultra 9 285K');
  });
});
