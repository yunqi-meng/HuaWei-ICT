import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import Login from "./Login";

const auth=vi.hoisted(()=>({loading:false,login:vi.fn(),register:vi.fn()}));
vi.mock("../auth",()=>({useAuth:()=>auth}));
function Destination(){const location=useLocation();return <output aria-label="登录返回路径">{location.pathname+location.search}</output>;}
beforeEach(()=>{auth.login.mockReset();auth.register.mockReset();});afterEach(cleanup);
describe("登录体验",()=>{
  it("密码显隐保留输入，登录后恢复包含查询参数的目标页面",async()=>{
    auth.login.mockResolvedValue(undefined);
    render(<MemoryRouter initialEntries={[{pathname:"/login",state:{back:"/appointments/new?ticketId=one"}}]}><Login/><Destination/></MemoryRouter>);
    await userEvent.type(screen.getByLabelText("邮箱地址"),"student@example.edu");
    const password=screen.getByLabelText("密码");await userEvent.type(password,"GoodPass123!");
    await userEvent.click(screen.getByRole("button",{name:"显示密码"}));expect(password.getAttribute("type")).toBe("text");
    await userEvent.click(screen.getByRole("button",{name:"隐藏密码"}));expect((password as HTMLInputElement).value).toBe("GoodPass123!");
    await userEvent.click(within(screen.getByRole("form",{name:"登录表单"})).getByRole("button",{name:"登录"}));
    expect(screen.getByLabelText("登录返回路径").textContent).toBe("/appointments/new?ticketId=one");
  });
  it("登录失败后保留输入与返回路径，允许重试",async()=>{
    render(<MemoryRouter initialEntries={[{pathname:"/login",state:{back:"/my/devices"}}]}><Login/><Destination/></MemoryRouter>);
    await userEvent.type(screen.getByLabelText("邮箱地址"),"student@example.edu");await userEvent.type(screen.getByLabelText("密码"),"GoodPass123!");
    auth.login.mockRejectedValueOnce(new Error("账号或密码不正确"));
    await userEvent.click(within(screen.getByRole("form")).getByRole("button",{name:"登录"}));
    expect(screen.getByRole("alert").textContent).toContain("账号或密码不正确");
    expect((screen.getByLabelText("邮箱地址") as HTMLInputElement).value).toBe("student@example.edu");
    auth.login.mockResolvedValueOnce(undefined);await userEvent.click(within(screen.getByRole("form")).getByRole("button",{name:"登录"}));
    expect(screen.getByLabelText("登录返回路径").textContent).toBe("/my/devices");
  });
});
