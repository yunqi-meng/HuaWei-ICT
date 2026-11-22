import type { IconName } from "./components/Icon";

export interface NavigationItem {
  to: string;
  label: string;
  description: string;
  icon: IconName;
  group: "探索与求助" | "我的空间" | "服务管理";
  roles?: string[];
}

export const navigation: NavigationItem[] = [
  {to:"/",label:"工作空间",description:"服务入口与硬件探索",icon:"grid",group:"探索与求助"},
  {to:"/help",label:"问题求助",description:"描述故障，逐步排查",icon:"tool",group:"探索与求助"},
  {to:"/perf",label:"性能对比",description:"基准成绩与能耗曲线",icon:"chart",group:"探索与求助"},
  {to:"/hardware",label:"硬件数据库",description:"芯片、主板与规格来源",icon:"chip",group:"探索与求助"},
  {to:"/quality",label:"做工资料",description:"供电、结构与产品细节",icon:"layers",group:"探索与求助"},
  {to:"/guides",label:"问题指南",description:"查阅适用环境与操作依据",icon:"book",group:"探索与求助"},
  {to:"/my/tickets",label:"我的服务",description:"工单与排障记录",icon:"clipboard",group:"我的空间"},
  {to:"/my/devices",label:"我的设备",description:"管理电脑与操作系统",icon:"monitor",group:"我的空间"},
  {to:"/appointments/new",label:"预约义诊",description:"选择活动与服务时段",icon:"calendar",group:"我的空间"},
  {to:"/notifications",label:"站内通知",description:"预约与维修进展",icon:"bell",group:"我的空间"},
  {to:"/my/account",label:"账号设置",description:"账号与邮箱验证",icon:"user",group:"我的空间"},
  {to:"/staff",label:"维修工作台",description:"接诊、检查与结果记录",icon:"tool",group:"服务管理",roles:["staff","admin"]},
  {to:"/admin",label:"运营概览",description:"服务统计与工单派发",icon:"chart",group:"服务管理",roles:["admin","dispatcher"]},
  {to:"/admin/scheduling",label:"活动排班",description:"场地、时段与志愿者",icon:"calendar",group:"服务管理",roles:["admin","dispatcher"]},
  {to:"/admin/knowledge",label:"知识编审",description:"草稿、审核与版本发布",icon:"book",group:"服务管理",roles:["admin","reviewer"]},
  {to:"/admin/system",label:"系统管理",description:"权限、运行状态与任务",icon:"settings",group:"服务管理",roles:["admin"]},
];

export const hardwareNavigation = [
  {to:"/hardware",label:"精选硬件"},
  {to:"/hardware/rankings",label:"基准排行"},
  {to:"/hardware/ladder",label:"全世代天梯"},
  {to:"/hardware/catalog",label:"全量规格"},
  {to:"/hardware/motherboards",label:"主板与芯片组"},
  {to:"/hardware/compare",label:"芯片对比"},
];

export function routeLabel(pathname: string) {
  if (pathname.startsWith("/diagnosis/")) return "智能排障";
  if (pathname.startsWith("/tickets/")) return "工单详情";
  if (pathname.startsWith("/guides/")) return "指南详情";
  if (pathname === "/login") return "登录与注册";
  if (pathname === "/help/booking") return "预约义诊";
  const entries = [...navigation, ...hardwareNavigation].sort((a,b)=>b.to.length-a.to.length);
  return entries.find(item=>pathname===item.to || (item.to!=="/" && pathname.startsWith(item.to+"/")))?.label || "工作空间";
}

export function pageAccent(pathname: string) {
  if (pathname === "/help/booking" || pathname.startsWith("/appointments") || pathname.startsWith("/tickets/") || pathname === "/my/tickets" || pathname.startsWith("/admin/scheduling")) return "service";
  if (pathname.startsWith("/help") || pathname.startsWith("/diagnosis/") || pathname.startsWith("/staff")) return "diagnosis";
  if (pathname.startsWith("/guides") || pathname.startsWith("/admin/knowledge")) return "knowledge";
  if (pathname.startsWith("/perf")) return "performance";
  if (pathname.startsWith("/hardware")) return "hardware";
  if (pathname.startsWith("/quality")) return "quality";
  if (pathname.startsWith("/admin")) return "operations";
  if (pathname.startsWith("/my/") || pathname === "/notifications" || pathname === "/login") return "personal";
  return "home";
}
