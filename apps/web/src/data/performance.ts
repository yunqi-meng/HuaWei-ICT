import type { EffPoint, TierItem } from "./perfTiers";

export function normalizePoints(points: EffPoint[] = []): EffPoint[] {
  const byPower = new Map<number, EffPoint>();
  for (const point of points) {
    if (
      Number.isFinite(point.power) &&
      point.power > 0 &&
      Number.isFinite(point.score) &&
      point.score >= 0
    )
      byPower.set(point.power, point);
  }
  return [...byPower.values()].sort((a, b) => a.power - b.power);
}

/** Interpolate only within the supplied range; never invent idle or over-limit measurements. */
export function scoreAtPower(points: EffPoint[], power: number): number | null {
  if (
    !points.length ||
    power < points[0].power ||
    power > points[points.length - 1].power
  )
    return null;
  const exact = points.find((point) => point.power === power);
  if (exact) return exact.score;
  const upper = points.findIndex((point) => point.power > power);
  if (upper < 1) return null;
  const a = points[upper - 1],
    b = points[upper];
  return (
    a.score + ((b.score - a.score) * (power - a.power)) / (b.power - a.power)
  );
}

export function buildCurveData(chips: TierItem[], efficiency = false) {
  const series = chips.map((chip) => normalizePoints(chip.eff));
  const powers = [
    ...new Set(series.flatMap((points) => points.map((point) => point.power))),
  ].sort((a, b) => a - b);
  return powers.map((power) => {
    const entry: Record<string, number | null> = { power };
    series.forEach((points, index) => {
      const score = scoreAtPower(points, power);
      entry[`chip${index}`] =
        score === null
          ? null
          : Number((efficiency ? score / power : score).toFixed(2));
    });
    return entry;
  });
}

export interface ImageView {
  scale: number;
  x: number;
  y: number;
}
export interface ImageBounds {
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}
export function fitImage(bounds: ImageBounds): ImageView {
  const scale = Math.min(
    bounds.width / bounds.imageWidth,
    bounds.height / bounds.imageHeight,
  );
  return clampView({ scale, x: 0, y: 0 }, bounds);
}
export function clampView(view: ImageView, bounds: ImageBounds): ImageView {
  const w = bounds.imageWidth * view.scale,
    h = bounds.imageHeight * view.scale;
  return {
    ...view,
    x:
      w <= bounds.width
        ? (bounds.width - w) / 2
        : Math.max(bounds.width - w, Math.min(0, view.x)),
    y:
      h <= bounds.height
        ? (bounds.height - h) / 2
        : Math.max(bounds.height - h, Math.min(0, view.y)),
  };
}
export function zoomImage(
  view: ImageView,
  scale: number,
  anchor: { x: number; y: number },
  bounds: ImageBounds,
): ImageView {
  const fit = Math.min(
    bounds.width / bounds.imageWidth,
    bounds.height / bounds.imageHeight,
  );
  const next = Math.max(fit * 0.5, Math.min(Math.max(2, fit * 8), scale));
  const ratio = next / view.scale;
  return clampView(
    {
      scale: next,
      x: anchor.x - (anchor.x - view.x) * ratio,
      y: anchor.y - (anchor.y - view.y) * ratio,
    },
    bounds,
  );
}
