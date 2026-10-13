import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/config";
import { clampRect, dragRect, fitAspect, setRectField, toSource, toView } from "@/lib/edit/crop";
import { computeOutputSize, widthForLongSide } from "@/lib/edit/output";

const W = 1920;
const H = 1080;
const inside = (r: { x: number; y: number; width: number; height: number }, w = W, h = H) =>
  r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= h;

describe("crop geometry", () => {
  it("maps between source and view coordinates", () => {
    const m = { scale: 0.5 };
    expect(toView({ x: 100, y: 50, width: 800, height: 400 }, m)).toEqual({ x: 50, y: 25, width: 400, height: 200 });
    expect(toSource(25, m)).toBe(50);
  });

  it("keeps rects inside the frame with a minimum size", () => {
    expect(clampRect({ x: -50, y: 2000, width: 5, height: 5 }, W, H)).toEqual({ x: 0, y: H - 16, width: 16, height: 16 });
    expect(clampRect({ x: 10, y: 10, width: 5000, height: 50 }, W, H).width).toBe(W);
  });

  it("free drag of a corner cannot leave the frame or invert", () => {
    const start = { x: 100, y: 100, width: 400, height: 300 };
    const r = dragRect(start, "se", 5000, 5000, null, W, H);
    expect(r).toEqual({ x: 100, y: 100, width: W - 100, height: H - 100 });
    const inv = dragRect(start, "nw", 1000, 1000, null, W, H);
    expect(inv.width).toBe(LIMITS.minCropSize);
    expect(inv.height).toBe(LIMITS.minCropSize);
    expect(inside(inv)).toBe(true);
  });

  it("move is clamped to the frame", () => {
    const r = dragRect({ x: 100, y: 100, width: 400, height: 300 }, "move", 10000, -10000, null, W, H);
    expect(r).toEqual({ x: W - 400, y: 0, width: 400, height: 300 });
  });

  it("fixed ratio drags keep the ratio and stay inside", () => {
    for (const ratio of [1, 16 / 9, 9 / 16]) {
      const start = fitAspect(ratio, W, H);
      for (const h of ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const) {
        for (const [dx, dy] of [
          [-300, -200],
          [250, 400],
          [-5000, 5000],
        ]) {
          const r = dragRect(start, h, dx, dy, ratio, W, H);
          expect(inside(r)).toBe(true);
          expect(Math.abs(r.width / r.height - ratio)).toBeLessThan(0.03);
        }
      }
    }
  });

  it("fitAspect produces the largest centered rect", () => {
    expect(fitAspect(1, W, H)).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
    const p = fitAspect(9 / 16, W, H);
    expect(p.height).toBe(1080);
    expect(p.width).toBe(608);
  });

  it("typed width keeps the locked ratio", () => {
    const r = setRectField({ x: 0, y: 0, width: 1920, height: 1080 }, "width", 960, 16 / 9, W, H);
    expect(r.width).toBe(960);
    expect(r.height).toBe(540);
  });
});

describe("computeOutputSize", () => {
  it("never upscales and keeps even dimensions", () => {
    const o = computeOutputSize({ x: 0, y: 0, width: 333, height: 201 }, 960, "mp4");
    expect(o.width).toBeLessThanOrEqual(333);
    expect(o.width % 2).toBe(0);
    expect(o.height % 2).toBe(0);
  });

  it("source rect matches the output ratio exactly and stays inside the crop", () => {
    const crops = [
      { x: 13, y: 7, width: 1001, height: 563 },
      { x: 0, y: 0, width: 780, height: 1688 },
      { x: 100, y: 100, width: 17, height: 900 },
    ];
    for (const crop of crops) {
      for (const w of [64, 321, 640, 960, 1280]) {
        const o = computeOutputSize(crop, w, "mp4");
        expect(o.sourceRect.width / o.sourceRect.height).toBeCloseTo(o.width / o.height, 9);
        expect(o.sourceRect.x).toBeGreaterThanOrEqual(crop.x - 1e-9);
        expect(o.sourceRect.y).toBeGreaterThanOrEqual(crop.y - 1e-9);
        expect(o.sourceRect.x + o.sourceRect.width).toBeLessThanOrEqual(crop.x + crop.width + 1e-9);
        expect(o.sourceRect.y + o.sourceRect.height).toBeLessThanOrEqual(crop.y + crop.height + 1e-9);
        // trims at most ~2 output pixels worth of content
        expect(crop.width - o.sourceRect.width).toBeLessThanOrEqual((2 * crop.width) / o.width + 1e-6);
        expect(crop.height - o.sourceRect.height).toBeLessThanOrEqual((2 * crop.height) / o.height + 1e-6);
      }
    }
  });

  it("respects format limits on the long side", () => {
    const portrait = { x: 0, y: 0, width: 1080, height: 1920 };
    const o = computeOutputSize(portrait, 1080, "gif");
    expect(o.height).toBeLessThanOrEqual(LIMITS.maxOutputLongSide.gif);
    expect(Math.abs(o.width / o.height - 1080 / 1920)).toBeLessThan(0.01);
  });

  it("preset long side adapts to portrait crops", () => {
    expect(widthForLongSide({ x: 0, y: 0, width: 1920, height: 1080 }, 960)).toBe(960);
    expect(widthForLongSide({ x: 0, y: 0, width: 1080, height: 1920 }, 960)).toBe(540);
  });
});
