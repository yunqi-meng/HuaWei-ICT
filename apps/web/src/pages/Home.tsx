import { Link } from "react-router-dom";
import Icon, { type IconName } from "../components/Icon";

const services: {
  number: string;
  icon: IconName;
  title: string;
  description: string;
  color: string;
  links: { to: string; label: string }[];
}[] = [
  {
    number: "01",
    icon: "tool",
    title: "电脑有问题，一起排查",
    description:
      "从故障描述开始，按步骤定位问题。需要帮忙时，再预约校园线下义诊。",
    color: "teal",
    links: [
      { to: "/help", label: "开始排查" },
      { to: "/appointments/new", label: "预约维修" },
    ],
  },
  {
    number: "02",
    icon: "chart",
    title: "看懂性能，选对硬件",
    description:
      "查看有来源的 CPU 与 GPU 基准成绩，对照厂商规格了解硬件差异。",
    color: "peach",
    links: [
      { to: "/perf", label: "查看天梯" },
      { to: "/hardware", label: "规格与来源" },
    ],
  },
  {
    number: "03",
    icon: "chip",
    title: "好做工，藏在细节里",
    description: "核对具体型号的供电、结构与散热资料，查看官方图片和原始来源。",
    color: "blue",
    links: [
      { to: "/quality/desktop", label: "桌面硬件" },
      { to: "/quality/mobile", label: "笔记本" },
    ],
  },
];
export default function Home() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" /> 为校园里的每一台电脑
          </div>
          <h1>
            电脑问题，
            <br />
            在这里<span>简单一点。</span>
          </h1>
          <p>
            从一次耐心的排查，到一次面对面的维修。
            <br className="desktop-break" />
            知修陪你了解电脑，也帮你把它修好。
          </p>
          <div className="hero-actions">
            <Link to="/help" className="btn btn-primary">
              开始排查问题 <Icon name="arrow" size={18} />
            </Link>
            <Link to="/perf" className="hero-secondary">
              探索硬件性能 <Icon name="arrow" size={18} />
            </Link>
          </div>
          <div className="hero-notes">
            <span>
              <Icon name="check" size={15} />
              按步骤引导
            </span>
            <span>
              <Icon name="check" size={15} />
              校园志愿服务
            </span>
            <span>
              <Icon name="check" size={15} />
              维修进度可追踪
            </span>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="hero-device">
            <div className="device-topbar">
              <span />
              <span />
              <span />
              <div>ZHIXIU WORKSPACE</div>
            </div>
            <div className="device-screen">
              <div className="device-chip">
                <Icon name="chip" size={45} />
              </div>
              <div className="device-greeting">很高兴，又见到你。</div>
              <div className="device-subtitle">让每一次排查都有方向</div>
              <div className="device-chart">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="device-status">
                <span className="live-dot" /> 准备就绪{" "}
                <span>一起解决电脑问题</span>
              </div>
            </div>
            <div className="device-base" />
          </div>
          <div className="float-note note-top">
            <span className="float-icon">
              <Icon name="shield" size={21} />
            </span>
            <div>
              <strong>每一步，都有依据</strong>
              <span>清晰的排查流程</span>
            </div>
          </div>
          <div className="float-note note-bottom">
            <span className="float-icon warm">
              <Icon name="bolt" size={21} />
            </span>
            <div>
              <strong>规格与成绩，查来源</strong>
              <span>了解数据的适用范围</span>
            </div>
          </div>
        </div>
      </section>
      <section className="home-services">
        <div className="section-heading">
          <div>
            <div className="eyebrow">从这里开始</div>
            <h2>你现在需要什么帮助？</h2>
          </div>
          <span className="muted small">自助排查 · 硬件探索 · 校园维修</span>
        </div>
        <div className="service-grid">
          {services.map((service) => (
            <article
              key={service.number}
              className={`service-card ${service.color}`}
            >
              <div className="service-top">
                <span className="service-icon">
                  <Icon name={service.icon} size={25} />
                </span>
                <span className="service-number">{service.number}</span>
              </div>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
              <div className="service-links">
                {service.links.map((link) => (
                  <Link key={link.to} to={link.to}>
                    {link.label}
                    <Icon name="arrow" size={15} />
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="quick-access" aria-label="快捷入口">
        {(
          [
            {
              to: "/guides",
              icon: "book",
              label: "问题指南",
              desc: "常见问题，随时查阅",
            },
            {
              to: "/hardware",
              icon: "search",
              label: "硬件数据库",
              desc: "规格与跑分，一站查询",
            },
            {
              to: "/my/devices",
              icon: "monitor",
              label: "我的设备",
              desc: "管理设备，方便求助",
            },
            {
              to: "/my/tickets",
              icon: "calendar",
              label: "我的服务",
              desc: "查看预约与维修进度",
            },
          ] as const
        ).map((item) => (
          <Link to={item.to} key={item.to}>
            <Icon name={item.icon} size={22} />
            <div>
              <strong>{item.label}</strong>
              <span>{item.desc}</span>
            </div>
            <span className="quick-arrow">↗</span>
          </Link>
        ))}
      </section>
      <section className="home-care">
        <span className="care-icon">
          <Icon name="tool" size={27} />
        </span>
        <div>
          <h2>线上没解决？线下接着帮你。</h2>
          <p>带上电脑和电源，和校园维修志愿者一起找到问题所在。</p>
        </div>
        <Link to="/appointments/new" className="btn">
          预约校园义诊 <Icon name="arrow" size={17} />
        </Link>
      </section>
    </div>
  );
}
