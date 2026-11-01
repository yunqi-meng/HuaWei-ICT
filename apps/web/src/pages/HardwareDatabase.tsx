import HardwareSources from "../components/HardwareSources";
import { formatValue } from "../data/hardware";
import { useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncState";
import { useDebouncedValue, useResource } from "../hooks/useResource";
interface Chip {
  id: string;
  name: string;
  brand: string;
  type: string;
  tier: string;
  year: number;
  process: string;
  arch: string;
  [key: string]: unknown;
}
const tierLabels: Record<string, string> = {
  flagship: "旗舰",
  "high-end": "高端",
  "mid-range": "中端",
  budget: "入门",
};
export default function HardwareDatabase() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [tier, setTier] = useState("");
  const [selected, setSelected] = useState<Chip[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const search = useDebouncedValue(q.trim());
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (type) params.set("type", type);
  if (brand) params.set("brand", brand);
  if (tier) params.set("tier", tier);
  const { data, loading, error, reload } = useResource<{
    items: Chip[];
    total: number;
  }>(`/hardware/chips?${params}`);
  const items = data?.items || [];
  function toggle(chip: Chip) {
    setSelectionError("");
    if (selected.some((item) => item.id === chip.id)) {
      setSelected(selected.filter((item) => item.id !== chip.id));
      return;
    }
    if (selected.length >= 6) {
      setSelectionError("最多选择 6 款芯片，请先移除一个型号。");
      return;
    }
    if (selected.length && selected[0].type !== chip.type) {
      setSelectionError(
        "CPU 与 GPU 的测试指标不同，请先清空选择再切换芯片类型。",
      );
      return;
    }
    setSelected([...selected, chip]);
  }
  return (
    <div>
      <PageHeader
        eyebrow="HARDWARE LIBRARY / 硬件数据库"
        title="每一款芯片，都了解一点。"
        description="查询 CPU / GPU 的规格与基准测试参考成绩，选择同类型芯片并排比较。"
        actions={
          <Link className="btn" to="/hardware/rankings">
            <Icon name="chart" size={17} />
            查看排行榜
          </Link>
        }
      />
      <HardwareSources />
      <section className="card">
        <div className="hardware-filters">
          <div className="search-field">
            <Icon name="search" size={17} />
            <input
              aria-label="搜索芯片"
              placeholder="搜索型号、品牌或关键词"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          <select
            aria-label="芯片类型筛选"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">全部类型</option>
            <option value="cpu">CPU 处理器</option>
            <option value="gpu">GPU 显卡</option>
          </select>
          <select
            aria-label="品牌筛选"
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
          >
            <option value="">全部品牌</option>
            {["Intel", "AMD", "Apple", "NVIDIA", "Qualcomm", "MediaTek"].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
          <select
            aria-label="项目分组筛选"
            value={tier}
            onChange={(event) => setTier(event.target.value)}
          >
            <option value="">全部项目分组</option>
            {Object.entries(tierLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {(q || type || brand || tier) && (
          <div className="selection-bar">
            <span className="muted small">
              {loading ? "正在筛选…" : `找到 ${data?.total || 0} 款芯片`}
            </span>
            <button
              className="text-button"
              onClick={() => {
                setQ("");
                setType("");
                setBrand("");
                setTier("");
              }}
            >
              重置筛选
            </button>
          </div>
        )}
      </section>
      {selectionError && <ErrorState message={selectionError} />}
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading ? (
        <LoadingState label="正在查询硬件数据库…" />
      ) : !items.length ? (
        <section className="card">
          <EmptyState
            title="没有找到匹配的芯片"
            description="试试其他关键词，或重置品牌和类型筛选。"
          />
        </section>
      ) : (
        <>
          <p className="muted small" role="status">
            共 {items.length} 款芯片 · 规格与成绩附来源，缺失值不计为零 · 最多选择 6
            款同类型芯片对比
          </p>
          <div className="hardware-grid">
            {items.map((chip) => {
              const active = selected.some((item) => item.id === chip.id);
              const fields =
                chip.type === "cpu"
                  ? [
                      ["核心", chip.cores],
                      [String(chip.power_label), formatValue(chip.tdp, " W")],
                      ["GB7 多核", formatValue(chip.gb7_multi)],
                      ["GB7 单核", formatValue(chip.gb7_single)],
                    ]
                  : [
                      ["显存", `${chip.vram} GB`],
                      [String(chip.power_label), formatValue(chip.tdp, " W")],
                      ["GB7 OpenCL", formatValue(chip.gb7_opencl)],
                      ["显存位宽", `${chip.bus_width} bit`],
                    ];
              return (
                <article
                  key={chip.id}
                  className={`card hardware-card ${active ? "is-selected" : ""}`}
                >
                  <div className="chip-card-header">
                    <div>
                      <h3>
                        <Link to={`/hardware/${chip.id}`}>{chip.name}</Link>
                      </h3>
                      <span className="muted small">
                        {chip.brand} · {chip.type.toUpperCase()} · {chip.year}
                      </span>
                    </div>
                    <span className="badge badge-neutral">
                      {tierLabels[chip.tier] || chip.tier}
                    </span>
                  </div>
                  <div className="chip-specs">
                    <div>
                      <span className="muted">工艺 </span>
                      {formatValue(chip.process)}
                    </div>
                    <div>
                      <span className="muted">架构 </span>
                      {chip.arch}
                    </div>
                    {fields.map(([label, value]) => (
                      <div key={String(label)}>
                        <span className="muted">{String(label)} </span>
                        {String(value ?? "—")}
                      </div>
                    ))}
                  </div>
                  <div className="card-actions">
                    <Link className="text-button" to={`/hardware/${chip.id}`}>
                      查看规格 <Icon name="arrow" size={14} />
                    </Link>
                    <button
                      className={`btn ${active ? "btn-primary" : ""}`}
                      aria-pressed={active}
                      aria-label={`${active ? "取消选择" : "加入对比"} ${chip.name}`}
                      onClick={() => toggle(chip)}
                    >
                      <Icon name={active ? "check" : "plus"} size={14} />
                      {active ? "已加入" : "加入对比"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      {selected.length > 0 && (
        <aside className="compare-tray" aria-label="已选芯片">
          <span>
            <strong>已选 {selected.length} / 6</strong> ·{" "}
            {selected[0].type.toUpperCase()}
          </span>
          <span className="muted small">
            {selected.map((chip) => chip.name).join("、")}
          </span>
          {selected.length >= 2 ? (
            <Link
              to={`/hardware/compare?ids=${selected.map((chip) => chip.id).join(",")}`}
              className="btn btn-primary"
            >
              对比所选 <Icon name="arrow" size={15} />
            </Link>
          ) : (
            <span className="muted small">再选 1 款即可开始对比</span>
          )}
          <button
            className="text-button"
            onClick={() => {
              setSelected([]);
              setSelectionError("");
            }}
          >
            清空
          </button>
        </aside>
      )}
    </div>
  );
}
