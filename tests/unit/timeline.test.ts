import { describe, expect, it } from "vitest";
import { clipOutputDuration, planGifFrames, planVideoFrames, totalOutputDuration } from "@/lib/edit/timeline";

const base = { start: 1, end: 5, speed: 1, fps: 15, holdStart: 0, holdEnd: 0 };
const sumCs = (t: typeof base) => planGifFrames(t).reduce((s, f) => s + f.delayCs, 0);

describe("output duration", () => {
  it("applies speed and holds", () => {
    expect(clipOutputDuration({ start: 2, end: 10, speed: 2 })).toBe(4);
    expect(totalOutputDuration({ ...base, speed: 0.5, holdStart: 1, holdEnd: 1.5 })).toBe(10.5);
  });
});

describe("planGifFrames", () => {
  it("covers the clip exactly at the requested frame rate", () => {
    const f = planGifFrames(base);
    expect(f).toHaveLength(60);
    expect(sumCs(base)).toBe(400);
    // 15 fps → delays alternate 7/7/6 (6.67 cs), never drifting
    expect(new Set(f.map((x) => x.delayCs))).toEqual(new Set([6, 7]));
  });

  it("samples source times with speed", () => {
    const t = { ...base, speed: 2, fps: 10 };
    const f = planGifFrames(t);
    expect(f).toHaveLength(20); // 4 s source / 2 = 2 s output at 10 fps
    expect(f[0].sourceTime).toBe(1);
    expect(f[1].sourceTime).toBeCloseTo(1.2);
    expect(f[f.length - 1].sourceTime).toBeLessThan(5);
    expect(sumCs(t)).toBe(200);
  });

  it("adds holds to the first and last frame", () => {
    const t = { ...base, holdStart: 1, holdEnd: 2.5 };
    const f = planGifFrames(t);
    expect(f).toHaveLength(60);
    expect(f[0].delayCs).toBe(107);
    expect(f[f.length - 1].delayCs).toBeGreaterThanOrEqual(256);
    expect(sumCs(t)).toBe(750);
  });

  it("handles fractional clip lengths without tiny trailing frames", () => {
    for (const end of [1.03, 1.049, 2.0001, 3.333]) {
      const t = { ...base, start: 0, end, fps: 24 };
      const f = planGifFrames(t);
      expect(Math.abs(sumCs(t) - Math.round(end * 100))).toBeLessThanOrEqual(0);
      for (const x of f) expect(x.delayCs).toBeGreaterThanOrEqual(2);
    }
  });

  it("produces at least one frame for very short clips", () => {
    const f = planGifFrames({ ...base, start: 0, end: 0.02, fps: 5 });
    expect(f).toHaveLength(1);
    expect(f[0].delayCs).toBe(2);
  });
});

describe("planGifFrames timing precision", () => {
  it("never drifts: total centiseconds equal the rounded output duration for any fps / speed / hold", () => {
    for (const fps of [1, 5, 8, 10, 12, 15, 20, 24, 30])
      for (const speed of [0.25, 0.75, 1, 1.5, 3, 4])
        for (const [holdStart, holdEnd] of [
          [0, 0],
          [0.3, 1.7],
        ]) {
          const t = { start: 0.37, end: 13.91, speed, fps, holdStart, holdEnd };
          const f = planGifFrames(t);
          const total = f.reduce((s, x) => s + x.delayCs, 0);
          expect(total).toBe(Math.round(totalOutputDuration(t) * 100));
          expect(f.every((x) => x.delayCs >= 2)).toBe(true);
          expect(f.every((x, i) => i === 0 || x.sourceTime > f[i - 1].sourceTime)).toBe(true);
          expect(f[f.length - 1].sourceTime).toBeLessThan(t.end);
        }
  });

  it("a 60 s clip at 15 fps is exactly 6000 cs over 900 frames", () => {
    const f = planGifFrames({ start: 0, end: 60, speed: 1, fps: 15, holdStart: 0, holdEnd: 0 });
    expect(f).toHaveLength(900);
    expect(f.reduce((s, x) => s + x.delayCs, 0)).toBe(6000);
  });
});

describe("planVideoFrames", () => {
  it("is constant frame rate and matches the total duration", () => {
    const t = { ...base, fps: 30, holdStart: 0.5, holdEnd: 1 };
    const s = planVideoFrames(t);
    const last = s[s.length - 1];
    expect(last.timestamp + last.duration).toBeCloseTo(5.5, 6);
    expect(s).toHaveLength(165);
    for (let i = 1; i < s.length; i++) expect(s[i].timestamp - s[i - 1].timestamp).toBeCloseTo(1 / 30, 9);
  });

  it("repeats the first frame during the opening hold and the last during the closing hold", () => {
    const t = { ...base, fps: 10, speed: 2, holdStart: 0.3, holdEnd: 0.5 };
    const s = planVideoFrames(t);
    expect(s.slice(0, 3).every((x) => x.sourceTime === 1)).toBe(true);
    expect(s[3].sourceTime).toBeCloseTo(1);
    expect(s[4].sourceTime).toBeCloseTo(1.2);
    const lastClip = s[s.length - 1].sourceTime;
    expect(s.slice(-5).every((x) => x.sourceTime === lastClip)).toBe(true);
    expect(lastClip).toBeLessThan(5);
    expect(s.every((x, i) => i === 0 || x.sourceTime >= s[i - 1].sourceTime)).toBe(true);
  });
});
