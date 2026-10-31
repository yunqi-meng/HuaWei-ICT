import { Link } from "react-router-dom";

const CARDS = [
  {
    icon: "🔧",
    title: "问题求助",
    desc: "电脑出问题？AI 帮你排查解决，搞不定再预约线下维修",
    links: [
      { to: "/help", label: "AI 智能诊断" },
      { to: "/help/booking", label: "预约线下维修" },
    ],
    gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  {
    icon: "📊",
    title: "性能对比",
    desc: "CPU / GPU 天梯图，桌面端与移动端芯片性能一目了然",
    links: [
      { to: "/perf/desktop", label: "桌面端" },
      { to: "/perf/mobile", label: "移动端" },
    ],
    gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  },
  {
    icon: "🔨",
    title: "做工对比",
    desc: "主板、显卡、笔记本做工用料对比，帮你选到靠谱硬件",
    links: [
      { to: "/quality/desktop", label: "桌面端硬件" },
      { to: "/quality/mobile", label: "笔记本" },
    ],
    gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  },
];

export default function Home() {
  return (
    <div style={{
      maxWidth: 1100, margin: "0 auto",
      background: "linear-gradient(160deg, #fff5eb 0%, #ffe8d1 30%, #ffd4a8 60%, #ffb366 100%)",
      borderRadius: 20, padding: "10px 0 20px", marginTop: 10,
    }}>
      {/* Hero 区域 */}
      <div style={{ textAlign: "center", padding: "60px 20px 40px" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🍊</div>
        <h1 style={{ fontSize: 42, fontWeight: 800, marginBottom: 12, color: "#c2410c" }}>
          知修 · 电脑义诊
        </h1>
        <p style={{ fontSize: 18, color: "#9a3412", maxWidth: 520, margin: "0 auto" }}>
          电脑问题一站式服务平台 —— 智能诊断、性能天梯、硬件做工，帮你解决所有电脑难题
        </p>
      </div>

      {/* 三大入口卡片 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 24,
        padding: "0 20px 60px",
      }}>
        {CARDS.map(card => (
          <div key={card.title} style={{
            background: "#fff",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            transition: "transform 0.2s, box-shadow 0.2s",
            cursor: "pointer",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 40px rgba(0,0,0,0.12)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 24px rgba(0,0,0,0.06)";
            }}
          >
            {/* 顶部色带 */}
            <div style={{
              background: card.gradient,
              padding: "36px 24px 28px",
              color: "#fff",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>{card.icon}</div>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{card.title}</h2>
            </div>
            {/* 内容 */}
            <div style={{ padding: "24px" }}>
              <p style={{ color: "#666", fontSize: 15, lineHeight: 1.7, margin: "0 0 20px" }}>{card.desc}</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {card.links.map(link => (
                  <Link key={link.to} to={link.to} style={{
                    display: "inline-block",
                    padding: "10px 22px",
                    borderRadius: 10,
                    background: "#f0f2f5",
                    color: "#333",
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: 500,
                    transition: "background 0.2s",
                  }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#e4e8ec"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#f0f2f5"}
                  >
                    {link.label} →
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 底部快捷方式 */}
      <div style={{
        background: "rgba(255,255,255,0.6)",
        borderRadius: 16,
        padding: "28px 32px",
        margin: "0 20px 40px",
        display: "flex",
        justifyContent: "center",
        gap: 32,
        flexWrap: "wrap",
        backdropFilter: "blur(8px)",
      }}>
        {[
          { to: "/guides", icon: "📖", label: "问题指南" },
          { to: "/appointments/new", icon: "📅", label: "预约维修" },
          { to: "/hardware/rankings", icon: "🏆", label: "性能排行" },
          { to: "/my/tickets", icon: "📋", label: "我的工单" },
        ].map(item => (
          <Link key={item.to} to={item.to} style={{
            display: "flex", alignItems: "center", gap: 8,
            color: "#c2410c", textDecoration: "none", fontSize: 14, fontWeight: 500,
          }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
