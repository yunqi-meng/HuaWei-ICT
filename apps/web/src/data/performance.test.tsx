import { describe, expect, it } from "vitest";
import {
  buildCurveData,
  clampView,
  fitImage,
  normalizePoints,
  scoreAtPower,
  zoomImage,
} from "./performance";
import { getTiers } from "./perfTiers";

describe("功耗数据与插值", () => {
  it("保留原始功耗刻度，在数据边界外留空", () => {
    const data = buildCurveData([
      {
        name: "Chip A.with.dot",
        brand: "A",
        score: 600,
        eff: [
          { power: 10, score: 100 },
          { power: 30, score: 300 },
        ],
      },
      {
        name: "Chip B",
        brand: "B",
        score: 500,
        eff: [
          { power: 20, score: 300 },
          { power: 50, score: 450 },
        ],
      },
    ]);
    expect(data).toEqual([
      { power: 10, chip0: 100, chip1: null },
      { power: 20, chip0: 200, chip1: 300 },
      { power: 30, chip0: 300, chip1: 350 },
      { power: 50, chip0: null, chip1: 450 },
    ]);
  });
  it("不虚构零瓦性能或超过上限的性能平台", () => {
    const points = [
      { power: 5, score: 100 },
      { power: 15, score: 200 },
    ];
    expect(scoreAtPower(points, 0)).toBeNull();
    expect(scoreAtPower(points, 16)).toBeNull();
    expect(scoreAtPower(points, 10)).toBe(150);
    expect(scoreAtPower([], 10)).toBeNull();
  });
  it("排序、去除非法点与重复功耗，不修改原数据", () => {
    const raw = [
      { power: 30, score: 300 },
      { power: 0, score: 0 },
      { power: 10, score: 90 },
      { power: 10, score: 100 },
      { power: NaN, score: 10 },
      { power: 20, score: -1 },
    ];
    expect(normalizePoints(raw)).toEqual([
      { power: 10, score: 100 },
      { power: 30, score: 300 },
    ]);
    expect(raw).toHaveLength(6);
  });
  it("每瓦性能由当前功耗的性能计算", () => {
    expect(
      buildCurveData(
        [
          {
            name: "A",
            brand: "A",
            score: 1,
            eff: [
              { power: 10, score: 150 },
              { power: 30, score: 300 },
            ],
          },
        ],
        true,
      ),
    ).toEqual([
      { power: 10, chip0: 15 },
      { power: 30, chip0: 10 },
    ]);
    expect(buildCurveData([])).toEqual([]);
  });
  it("六个分类均无重复型号，功耗数据有效且递增", () => {
    for (const platform of ["desktop", "mobile", "phone"] as const)
      for (const component of ["cpu", "gpu"] as const) {
        const chips = getTiers(platform, component).flatMap(
          (tier) => tier.items,
        );
        expect(new Set(chips.map((chip) => chip.name)).size).toBe(chips.length);
        for (const chip of chips)
          if (chip.eff) expect(normalizePoints(chip.eff)).toEqual(chip.eff);
      }
  });
});

describe("天梯图视窗", () => {
  const bounds = {
    width: 1000,
    height: 600,
    imageWidth: 1440,
    imageHeight: 4000,
  };
  it("超长图片初始化时完整可见，且居中", () => {
    expect(fitImage(bounds)).toEqual({ scale: 0.15, x: 392, y: 0 });
  });
  it("缩放以指针下的图像坐标为中心", () => {
    const view = { scale: 1, x: -150, y: -200 },
      anchor = { x: 450, y: 250 };
    const zoomed = zoomImage(view, 1.5, anchor, bounds);
    expect((anchor.x - view.x) / view.scale).toBeCloseTo(
      (anchor.x - zoomed.x) / zoomed.scale,
    );
    expect((anchor.y - view.y) / view.scale).toBeCloseTo(
      (anchor.y - zoomed.y) / zoomed.scale,
    );
  });
  it("禁止把图片拖出画布，缩小时重新居中", () => {
    expect(clampView({ scale: 1, x: 9999, y: -9999 }, bounds)).toEqual({
      scale: 1,
      x: 0,
      y: -3400,
    });
    expect(clampView({ scale: 0.1, x: -500, y: -500 }, bounds)).toEqual({
      scale: 0.1,
      x: 428,
      y: 100,
    });
  });
  it("连续滚轮缩放保持有限的缩放范围", () => {
    expect(
      zoomImage(fitImage(bounds), 0.00001, { x: 0, y: 0 }, bounds).scale,
    ).toBe(0.075);
    expect(
      zoomImage(fitImage(bounds), 100000, { x: 0, y: 0 }, bounds).scale,
    ).toBe(2);
  });
});
