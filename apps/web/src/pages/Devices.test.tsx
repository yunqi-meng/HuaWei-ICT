import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Devices from "./Devices";
import { api } from "../api";

const reload=vi.hoisted(()=>vi.fn());
vi.mock("../api",()=>({api:vi.fn()}));
vi.mock("../hooks/useResource",()=>({useResource:()=>({data:[{id:"device-1",brand_model:"工作笔记本",kind:"laptop",os_family:"windows",os_version:"Windows 11"}],loading:false,error:"",reload})}));
beforeEach(()=>{vi.mocked(api).mockReset();reload.mockReset();});
afterEach(cleanup);
describe("设备管理操作",()=>{
  it("取消删除不会发送请求，确认删除后才更新列表",async()=>{
    render(<Devices/>);await userEvent.click(screen.getByRole("button",{name:"删除设备"}));
    await userEvent.click(screen.getByRole("button",{name:"保留设备"}));expect(api).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button",{name:"删除设备"}));
    vi.mocked(api).mockResolvedValueOnce({ok:true});
    await userEvent.click(screen.getByRole("button",{name:"确认删除"}));
    expect(api).toHaveBeenCalledWith("/devices/device-1",{method:"DELETE"});
    expect(screen.queryByRole("dialog")).toBeNull();expect(reload).toHaveBeenCalledOnce();
  });
  it("关联记录禁止删除时保留弹窗并显示服务端原因",async()=>{
    vi.mocked(api).mockRejectedValueOnce(new Error("设备关联已有工单，请保留"));
    render(<Devices/>);await userEvent.click(screen.getByRole("button",{name:"删除设备"}));
    await userEvent.click(screen.getByRole("button",{name:"确认删除"}));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toContain("已有工单");
    expect(reload).not.toHaveBeenCalled();
  });
  it("编辑失败不丢失用户输入，可修改后重试",async()=>{
    render(<Devices/>);await userEvent.click(screen.getByRole("button",{name:"编辑设备"}));
    const model=screen.getByLabelText("品牌型号或备注名");await userEvent.clear(model);await userEvent.type(model,"新的设备名");
    vi.mocked(api).mockRejectedValueOnce(new Error("连接暂时不可用"));
    await userEvent.click(screen.getByRole("button",{name:"保存修改"}));
    expect((model as HTMLInputElement).value).toBe("新的设备名");
    vi.mocked(api).mockResolvedValueOnce({ok:true});await userEvent.click(screen.getByRole("button",{name:"保存修改"}));
    expect(api).toHaveBeenLastCalledWith("/devices/device-1",expect.objectContaining({method:"PUT",body:expect.objectContaining({brand_model:"新的设备名"})}));
    expect(screen.getByRole("status").textContent).toContain("设备信息已更新");
  });
});
