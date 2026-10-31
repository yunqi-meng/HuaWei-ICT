import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";

interface Message {
  role: "user" | "ai";
  text: string;
  solved?: boolean;
}

const QUICK_PROBLEMS = [
  { icon: "🐌", label: "电脑很卡/很慢", tip: "检查启动项、清理磁盘、升级内存" },
  { icon: "🌐", label: "上不了网", tip: "检查网线/WiFi、重启路由器、更新网卡驱动" },
  { icon: "🔊", label: "没有声音", tip: "检查音量设置、音频驱动、输出设备" },
  { icon: "💾", label: "蓝屏/死机", tip: "检查内存条、硬盘健康、系统日志" },
  { icon: "🖨️", label: "打印机连不上", tip: "检查驱动、网络共享、打印队列" },
  { icon: "🔋", label: "笔记本掉电快", tip: "校准电池、降低亮度、关闭后台" },
];

const AI_RESPONSES: Record<string, string> = {
  "电脑很卡/很慢": `## 电脑卡慢排查步骤

### 1️⃣ 先检查是不是内存不够
- 按 **Ctrl+Shift+Esc** 打开任务管理器
- 看「性能」→「内存」，占用超过 **85%** 就需要加内存

### 2️⃣ 清理开机启动项
- 任务管理器 →「启动」标签
- 禁用不需要开机自启的程序（保留杀毒和驱动相关）

### 3️⃣ 检查磁盘空间
- C 盘剩余空间低于 **10GB** 会严重影响性能
- 用系统自带「磁盘清理」工具清理临时文件

### 4️⃣ 检查是否中毒
- 用 Windows Defender 全盘扫描

> 💡 **如果以上都试过还卡**，可能是硬盘老化（机械硬盘换 SSD 提升巨大），建议预约线下检测。`,

  "上不了网": `## 网络问题排查

### 1️⃣ 先看能不能 ping 通
- 按 **Win+R** 输入 \`cmd\`，输入 \`ping 223.5.5.5\`
- 能 ping 通 = 网络没问题，是 DNS 问题
- ping 不通 = 网络连接问题

### 2️⃣ DNS 问题修复
\`\`\`
ipconfig /flushdns
netsh winsock reset
\`\`\`
然后重启电脑

### 3️⃣ 网络连接问题
- **有线**：换根网线试试，看网卡灯亮不亮
- **WiFi**：忘记网络重新连接，或重启路由器
- 检查 IP 是否为 169.254.x.x（说明没拿到 IP）

### 4️⃣ 驱动问题
- 设备管理器 → 网络适配器，看有没有黄色感叹号
- 有则需要重新安装网卡驱动

> 💡 **还是不行？** 可能是路由器/运营商问题，建议预约线下检测网卡硬件。`,

  "没有声音": `## 声音问题排查

### 1️⃣ 先检查基础设置
- 右下角喇叭图标 → 是不是静音了？
- 右键喇叭 →「打开音量合成器」→ 看每个程序的音量

### 2️⃣ 检查输出设备
- 右键喇叭 →「声音设置」→「输出」
- 确认选对了输出设备（音箱/耳机/显示器）

### 3️⃣ 驱动问题
- 设备管理器 →「声音、视频和游戏控制器」
- 右键声卡 →「更新驱动程序」
- 或者去主板/笔记本官网下载最新声卡驱动

### 4️⃣ 音频服务
- Win+R 输入 \`services.msc\`
- 找「Windows Audio」，确保是「正在运行」状态

> 💡 **硬件检测**：插入耳机如果有声音但音箱没有，可能是音箱或音频接口硬件问题。`,
};

export default function ProblemHelp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: "user", text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    // 模拟 AI 回复
    setTimeout(() => {
      const matched = Object.keys(AI_RESPONSES).find(k => text.includes(k.slice(0, 2)) || k.includes(text.slice(0, 3)));
      const response = matched
        ? AI_RESPONSES[matched]
        : `## 收到你的问题：「${text}」

### 通用排查建议

1. **重启试试** —— 能解决 50% 的问题
2. **看看错误提示** —— 拍照/截图保存错误代码
3. **最近装了什么** —— 新装软件/驱动可能是元凶
4. **系统更新** —— Windows 更新有时会修复已知 Bug

### 如果还是解决不了

可以试试这些高级排查：
- 事件查看器（Win+R → \`eventvwr\`）查看系统错误日志
- 安全模式启动排查第三方软件冲突
- 系统还原到之前正常的还原点

> 🤖 这是通用建议。**如果问题依然存在，建议预约线下维修**，让维修工程师帮你面对面检测。`;

      setMessages(prev => [...prev, { role: "ai", text: response }]);
      setTyping(false);
    }, 1200);
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1>🔧 问题求助</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        描述你遇到的电脑问题，AI 帮你排查解决。搞不定？随时预约线下维修。
      </p>

      {/* 快捷问题 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>常见问题一键排查</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {QUICK_PROBLEMS.map(p => (
            <button key={p.label} onClick={() => send(p.label)} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", borderRadius: 10, border: "1px solid #e8e8e8",
              background: "#fff", cursor: "pointer", textAlign: "left",
              fontSize: 14, transition: "border-color 0.2s",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "#667eea"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "#e8e8e8"}
            >
              <span style={{ fontSize: 22 }}>{p.icon}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{p.tip}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 聊天区域 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ minHeight: 300, maxHeight: 500, overflowY: "auto", padding: 4 }}>
          {messages.length === 0 && !typing && (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#aaa" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
              <p>在下方输入你的问题，或者点击上方的常见问题快速开始</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 14,
            }}>
              <div style={{
                maxWidth: "85%",
                padding: "12px 18px",
                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: msg.role === "user" ? "#667eea" : "#f4f6f8",
                color: msg.role === "user" ? "#fff" : "#333",
                fontSize: 14,
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                <div dangerouslySetInnerHTML={{
                  __html: msg.text
                    .replace(/### (.*)/g, '<h4 style="margin:12px 0 6px;font-size:14px;color:#444">$1</h4>')
                    .replace(/## (.*)/g, '<h3 style="margin:8px 0 10px;font-size:16px;color:#222">$1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/`([^`]+)`/g, '<code style="background:#e8e8e8;padding:1px 5px;border-radius:3px;font-size:12px">$1</code>')
                    .replace(/```([\s\S]*?)```/g, '<pre style="background:#2d2d2d;color:#eee;padding:10px;border-radius:8px;overflow-x:auto;font-size:12px;margin:8px 0">$1</pre>')
                    .replace(/^&gt; (.*)/gm, '<blockquote style="border-left:3px solid #667eea;margin:8px 0;padding:6px 12px;background:#eef0ff;border-radius:0 8px 8px 0;color:#555;font-size:13px">$1</blockquote>')
                    .replace(/^(\d+)️⃣ /gm, '<div style="margin:4px 0"><strong>$1.</strong> ')
                    .replace(/^- (.*)/gm, '<div style="margin:2px 0 2px 16px">• $1</div>')
                }} />
              </div>
            </div>
          ))}
          {typing && (
            <div style={{ padding: "8px 16px", color: "#999", fontSize: 13 }}>
              🤖 AI 正在分析你的问题…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 输入框 */}
        <div style={{ display: "flex", gap: 8, borderTop: "1px solid #eee", paddingTop: 12 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send(input)}
            placeholder="描述你的电脑问题…（回车发送）"
            style={{
              flex: 1, padding: "12px 16px", borderRadius: 10,
              border: "1px solid #ddd", fontSize: 14, outline: "none",
            }}
          />
          <button className="btn" onClick={() => send(input)} style={{ padding: "12px 24px" }}>
            发送
          </button>
        </div>
      </div>

      {/* 预约入口 */}
      <div className="card" style={{
        background: "linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)",
        border: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 36 }}>🧑‍🔧</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ margin: 0, marginBottom: 4 }}>AI 解决不了？预约线下维修</h3>
            <p style={{ margin: 0, color: "#8d6e63", fontSize: 14 }}>
              校园电脑义诊，专业维修志愿者面对面帮你排查硬件问题
            </p>
          </div>
          <Link to="/appointments/new" className="btn" style={{
            background: "#e65100", padding: "12px 28px", fontSize: 15,
          }}>
            📅 立即预约
          </Link>
        </div>
      </div>
    </div>
  );
}
