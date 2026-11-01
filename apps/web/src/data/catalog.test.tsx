import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { chips, formatValue } from "./hardware";
import { getTiers, tierImage } from "./perfTiers";
import quality from "./buildQuality.json";
import images from "./productImages.json";
import BuildQuality from "../pages/BuildQuality";
import TierImageViewer from "../components/TierImageViewer";
afterEach(cleanup);
describe("数据来源与图片一致性",()=>{
  it("公开分数有来源，未知值不显示为零，生产数据不包含估算曲线",()=>{
    for(const c of chips) {
      expect(c.efficiency_points).toEqual([]);
      for(const key of ["gb7_single","gb7_multi","gb7_opencl"] as const)
        if(c[key] != null) { expect(c.benchmark_source?.url).toContain("browser.geekbench.com");expect(c[key]).toBeGreaterThan(0); }
    }
    expect(formatValue(null," W")).toBe("未公开 / 待核验");
    expect(formatValue(undefined)).not.toContain("NaN");
  });
  it("天梯与硬件库使用相同成绩与可解释归一化，图片使用相同数据",()=>{
    for(const type of ["cpu","gpu"] as const) {
      const tiers=getTiers("desktop",type), rows=tiers.flatMap(t=>t.items);
      const metric=type==="cpu"?"gb7_multi":"gb7_opencl";
      const max=Math.max(...rows.map(r=>r.benchmark!));
      for(const row of rows) {
        expect(row.benchmark).toBe(chips.find(c=>c.id===row.id)![metric]);
        expect(row.score).toBe(Math.round(row.benchmark!/max*1000));
        expect(row.eff).toBeUndefined();
      }
      const svg=decodeURIComponent(tierImage(tiers,`${type.toUpperCase()} 天梯图`)!);
      expect(svg).toContain(rows[0].name);
      expect(svg).toContain("Geekbench 7");
    }
  });
  it("做工图片必须有素材来源，待核验条目不带臆造规格或评分",()=>{
    for(const item of quality) {
      if(item.image) expect(images.some(i=>i.path===item.image && i.product_id===item.id)).toBe(true);
      if(item.facts.length) expect(item.source_url).toMatch(/^https:\/\//);
      expect(item).not.toHaveProperty("score");
      expect(item).not.toHaveProperty("price");
    }
  });
  it("页面明确区分产品照片与缺图，并能展开来源",()=>{
    render(<MemoryRouter><BuildQuality /></MemoryRouter>);
    expect(screen.getAllByText("类别图标，非产品实拍").length).toBeGreaterThan(0);
    expect(screen.getByAltText("MPG Z890 CARBON WIFI 官方产品图").getAttribute("src")).toContain("verified/");
    fireEvent.click(screen.getAllByRole("button",{name:"查看详细资料 +"})[0]);
    expect(screen.getByText(/价格与售后随地区/)).toBeTruthy();
  });
  it("生成的 SVG 重试不追加 URL 查询串，普通图片重试保留原查询参数",()=>{
    const svg=tierImage(getTiers("desktop","cpu"),"CPU 天梯图")!;
    for(const src of [svg,"/images/example.png?variant=cpu"]) {
      render(<TierImageViewer src={src} title="重试测试" />);
      const img=screen.getByAltText("重试测试");
      fireEvent.error(img);
      fireEvent.click(screen.getByRole("button",{name:"重试"}));
      const next=img.getAttribute("src")!;
      if(src.startsWith("data:")) expect(next).toBe(src);
      else { const url=new URL(next);expect(url.searchParams.get("variant")).toBe("cpu");expect(url.searchParams.has("retry")).toBe(true); }
      cleanup();
    }
  });
});
