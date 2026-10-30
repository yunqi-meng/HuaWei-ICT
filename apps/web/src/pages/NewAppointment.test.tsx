import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router-dom";
import NewAppointment from "./NewAppointment";
import {api} from "../api";

vi.mock("../auth",()=>{const me={id:"user"};return {useAuth:()=>({me,loading:false})};});
vi.mock("../api",()=>({api:vi.fn(),newClientMessageId:()=>"stable-request"}));
const mockApi=vi.mocked(api);
const location={name:"大学生活动中心",building_room:"203 室",address_note:"东门进入"};
const event={id:"event",title:"周六义诊",service_date:"2030-01-05",location,service_scope:"系统问题",bring_note:"携带电源"};
const appointment={id:"appointment",ticket_id:"ticket",status:"HELD",slot:{id:"old-slot",start_at:"14:00",end_at:"14:30",service_date:event.service_date,event_title:event.title,location,bring_note:"携带电源"},hold_expires_at:new Date(Date.now()+240000).toISOString(),contact_name:"",contact_phone:""};
let active:typeof appointment|undefined;
let owner=true;
beforeEach(()=>{active={...appointment};owner=true;mockApi.mockReset();mockApi.mockImplementation(async(path)=>{
 if(path==="/tickets/ticket")return {id:"ticket",title:"电脑无声",status:"OPEN",can_manage:owner,active_appointment:active} as never;
 if(path==="/service-events")return [event] as never;
 if(path.startsWith("/service-slots"))return [{id:"new-slot",start_at:"14:30",end_at:"15:00",remaining:1,capacity:1}] as never;
 if(path.endsWith("/confirm"))return {...appointment,status:"CONFIRMED",checkin_code:"check-code"} as never;
 return {} as never;
});});
afterEach(cleanup);
const open=(query="")=>render(<MemoryRouter initialEntries={[`/appointments/new?ticketId=ticket${query}`]}><NewAppointment/></MemoryRouter>);

describe("预约状态恢复与改期",()=>{
 it("刷新后恢复原保留，显示房间并可继续确认",async()=>{
  const user=userEvent.setup();open();
  await screen.findByText("已保留的时段");
  expect(screen.getByText(/203 室/).textContent).toContain("大学生活动中心");
  expect(screen.queryByText("选择活动与时段")).toBeNull();
  await user.type(screen.getByLabelText("联系人姓名"),"张同学");
  await user.type(screen.getByLabelText("联系手机号"),"13800000000");
  await user.click(screen.getByRole("button",{name:"确认预约"}));
  await screen.findByText("预约已确认");
  expect(mockApi.mock.calls.some(([path])=>path==="/appointment-holds")).toBe(false);
 });
 it("保留过期后允许重选，不把过期保留当作成功预约",async()=>{
  active={...appointment,hold_expires_at:"2000-01-01T00:00:00Z"};
  const user=userEvent.setup();open();
  await screen.findByText("保留已过期，请重新选择时段。");
  expect(screen.queryByRole("button",{name:"确认预约"})).toBeNull();
  await user.click(screen.getByRole("button",{name:"重新选择时段"}));
  await screen.findByText("选择活动与时段");
 });
 it("改期失败保留原预约，并用同一个幂等键重试",async()=>{
  active={...appointment,status:"CONFIRMED"};
  let attempts=0;const original=mockApi.getMockImplementation()!;
  mockApi.mockImplementation(async(path,options)=>{
   if(path.endsWith("/reschedule")){
    attempts++;if(attempts===1)throw new Error("新时段名额已满，原预约仍然有效");
    return {...active,slot:{...appointment.slot,id:"new-slot",start_at:"14:30",end_at:"15:00"}} as never;
   }return original(path,options);
  });
  const user=userEvent.setup();open("&reschedule=1");
  await screen.findByText("原预约");
  await user.click(screen.getByRole("button",{name:"选择该活动"}));
  await user.click(await screen.findByRole("button",{name:/14:30 – 15:00/}));
  await user.click(screen.getByRole("button",{name:"确认改为所选时段"}));
  await screen.findByText("新时段名额已满，原预约仍然有效");
  expect(screen.getByText("原预约")).toBeTruthy();
  await user.click(screen.getByRole("button",{name:"确认改为所选时段"}));
  await screen.findByText("改期成功");
  const retries=mockApi.mock.calls.filter(([path])=>path.endsWith("/reschedule"));
  expect(retries[0][1]?.body).toEqual(retries[1][1]?.body);
 });
 it("拒绝在他人的工单上展示预约操作",async()=>{
  owner=false;open();await screen.findByText("只能为自己的工单预约。");
  expect(screen.queryByRole("button",{name:"确认预约"})).toBeNull();
 });
});
