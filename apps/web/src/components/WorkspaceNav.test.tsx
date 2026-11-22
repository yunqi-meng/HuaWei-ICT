import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import WorkspaceNav from "./WorkspaceNav";

const auth=vi.hoisted(()=>({me:{display_name:"测试维修员"},loading:false,logout:vi.fn(),hasRole:vi.fn((...roles:string[])=>roles.includes("admin"))}));
vi.mock("../auth",()=>({useAuth:()=>auth}));
function Position(){const location=useLocation();return <output aria-label="当前位置">{location.pathname}</output>;}
function open(){return render(<MemoryRouter><WorkspaceNav/><Position/></MemoryRouter>);}
beforeEach(()=>{
  localStorage.clear();
  Object.defineProperty(window,"matchMedia",{writable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))});
  auth.hasRole.mockImplementation((...roles:string[])=>roles.includes("admin"));
});
afterEach(()=>{cleanup();localStorage.clear();delete document.documentElement.dataset.theme;});

describe("工作空间导航与键盘交互",()=>{
  it("快捷键打开搜索，键盘选择页面并关闭弹窗",async()=>{
    open();fireEvent.keyDown(window,{key:"k",ctrlKey:true});
    const input=screen.getByRole("combobox",{name:"搜索功能与页面"});
    await userEvent.type(input,"主板与芯片组");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(input,{key:"Enter"});
    expect(screen.getByLabelText("当前位置").textContent).toBe("/hardware/motherboards");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("搜索无结果时方向键不会导航，Esc 关闭并恢复焦点",async()=>{
    open();const trigger=screen.getByRole("button",{name:"搜索功能与页面"});
    await userEvent.click(trigger);
    const input=screen.getByRole("combobox");
    await userEvent.type(input,"绝不存在的页面");
    fireEvent.keyDown(input,{key:"ArrowDown"});fireEvent.keyDown(input,{key:"Enter"});
    expect(screen.getByText("未找到对应功能")).toBeTruthy();
    fireEvent.keyDown(input,{key:"Escape"});
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("主题偏好在重新打开页面后保留",async()=>{
    const first=open();await userEvent.click(screen.getByRole("button",{name:"切换深色主题"}));
    expect(document.documentElement.dataset.theme).toBe("dark");
    first.unmount();open();expect(screen.getByRole("button",{name:"切换浅色主题"})).toBeTruthy();
  });
  it("普通账号无法从导航或搜索发现管理入口",async()=>{
    auth.hasRole.mockReturnValue(false);open();
    expect(screen.queryByRole("link",{name:"系统管理"})).toBeNull();
    await userEvent.click(screen.getByRole("button",{name:"搜索功能与页面"}));
    await userEvent.type(screen.getByRole("combobox"),"系统管理");
    expect(screen.queryByRole("option")).toBeNull();
  });
  it("手机抽屉锁定背景，Escape 关闭后恢复滚动与焦点",async()=>{
    vi.mocked(window.matchMedia).mockReturnValue({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as MediaQueryList);
    open();const trigger=screen.getByRole("button",{name:"展开导航"});
    await userEvent.click(trigger);expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document,{key:"Escape"});
    expect(document.body.style.overflow).not.toBe("hidden");expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole("button",{name:"展开导航"}).getAttribute("aria-expanded")).toBe("false");
  });
});
