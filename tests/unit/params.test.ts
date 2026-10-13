import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/config";
import { applyPreset, checkLimits, defaultParams, detectPreset, normalizeParams, outputSizeFor, setAspect, withCrop } from "@/lib/edit/params";
import type { EditParams, SourceInfo } from "@/lib/edit/types";
import { formatTime, parseTime } from "@/lib/format";

const src: SourceInfo = {
  fileName: "a.mp4",
  fileSize: 1000,
  container: "MP4",
  codec: "avc",
  duration: 20,
  firstTimestamp: 0,
  width: 2560,
  height: 1440,
  codedWidth: 2560,
  codedHeight: 1440,
  rotation: 0,
  averageFps: 30,
  hasAudio: true,
};

describe("params", () => {
  it("defaults to the balanced preset over the whole video", () => {
    const p = defaultParams(src);
    expect(p.preset).toBe("balanced");
    expect(p.start).toBe(0);
    expect(p.end).toBe(20);
    expect(p.gifLoop).toBe(0);
    expect(outputSizeFor(p)).toMatchObject({ width: 960, height: 540 });
  });

  it("presets change real parameters", () => {
    const p = defaultParams(src);
    const small = applyPreset(p, "small");
    const hd = applyPreset(p, "hd");
    expect([small.outputWidth, small.fps, small.gifColors]).toEqual([640, 10, 128]);
    expect([hd.outputWidth, hd.fps, hd.gifDither]).toEqual([1280, 24, true]);
  });

  it("manual edits become custom, and matching values are recognized again", () => {
    const p = defaultParams(src);
    expect(detectPreset({ ...p, fps: 12 })).toBe("custom");
    expect(detectPreset({ ...p, gifColors: 128 })).toBe("custom");
    expect(detectPreset({ ...p, speed: 2, holdEnd: 1, gifLoop: 3 })).toBe("balanced");
  });

  it("normalizes out-of-range values", () => {
    const p = normalizeParams(
      { ...defaultParams(src), start: 19.99, end: 50, fps: 120, speed: 0, holdStart: -3, holdEnd: 99, gifLoop: 500, crop: { x: -5, y: -5, width: 99999, height: 3 } },
      src,
    );
    expect(p.end).toBe(20);
    expect(p.end - p.start).toBeGreaterThanOrEqual(LIMITS.minClipSeconds - 1e-9);
    expect(p.fps).toBe(LIMITS.fps.max);
    expect(p.speed).toBe(LIMITS.speed.min);
    expect(p.holdStart).toBe(0);
    expect(p.holdEnd).toBe(LIMITS.hold.max);
    expect(p.gifLoop).toBe(LIMITS.gifLoopMaxPlays);
    expect(p.crop).toEqual({ x: 0, y: 0, width: 2560, height: 16 });
  });

  it("start can never pass the end", () => {
    const p = normalizeParams({ ...defaultParams(src), start: 10, end: 5 }, src);
    expect(p.start).toBeLessThan(p.end);
  });

  it("aspect presets produce matching crops", () => {
    const p = setAspect(defaultParams(src), "9:16", src);
    expect(p.crop.height).toBe(1440);
    expect(p.crop.width / p.crop.height).toBeCloseTo(9 / 16, 2);
    // preset long side now applies to the height
    expect(outputSizeFor(p).height).toBe(960);
  });

  it("crop changes keep the preset meaningful", () => {
    const p = withCrop(defaultParams(src), { x: 0, y: 0, width: 400, height: 300 });
    expect(p.preset).toBe("balanced");
    expect(outputSizeFor(p).width).toBe(400);
  });

  it("checks limits before export", () => {
    const long = { ...defaultParams(src, "gif"), start: 0, end: 20, speed: 0.25 };
    expect(checkLimits(long).map((i) => i.kind)).toContain("duration");
    expect(checkLimits({ ...long, format: "mp4" })).toEqual([]);
    expect(checkLimits({ ...defaultParams(src), end: 20 })).toEqual([]);
  });
});

describe("normalizeParams as the shared UI/worker gate", () => {
  it("is idempotent on everything the UI can produce", () => {
    let p = defaultParams(src);
    const edits: ((x: typeof p) => typeof p)[] = [
      (x) => ({ ...x, start: 3.3, end: 7.77 }),
      (x) => setAspect(x, "16:9", src),
      (x) => withCrop(x, { x: 10, y: 10, width: 17, height: 900 }),
      (x) => applyPreset(x, "hd"),
      (x) => ({ ...x, fps: 7.4, speed: 3.3, holdStart: 0.04, holdEnd: 2.26, gifLoop: 2.6 }),
      (x) => setAspect(x, "9:16", src),
    ];
    for (const e of edits) {
      p = normalizeParams(e(p), src);
      expect(normalizeParams(p, src)).toEqual(p);
    }
  });

  it("rejects malformed values from a crafted snapshot", () => {
    const bad = {
      ...defaultParams(src),
      start: NaN,
      end: Infinity,
      crop: { x: NaN, y: 5, width: NaN, height: Infinity },
      fps: NaN,
      format: "webp",
      aspect: "4:3",
      mp4Quality: "ultra",
      gifDither: "yes",
      preset: "insane",
    } as unknown as EditParams;
    const p = normalizeParams(bad, src);
    expect([p.start, p.end]).toEqual([0, 20]);
    expect(p.crop).toEqual({ x: 0, y: 0, width: 2560, height: 1440 });
    expect(p.fps).toBe(15);
    expect(p.format).toBe("gif");
    expect(p.aspect).toBe("free");
    expect(p.mp4Quality).toBe("medium");
    expect(p.gifDither).toBe(false);
    expect(p.preset).toBe("custom");
  });

  it("limits are checked on the normalized snapshot (what the worker encodes)", () => {
    const p = normalizeParams({ ...defaultParams(src), fps: 30, speed: 0.25, end: 20 }, src);
    const kinds = checkLimits(p).map((i) => i.kind);
    expect(kinds).toEqual(["duration", "frames"]);
  });
});

describe("time format", () => {
  it("parses and formats", () => {
    expect(parseTime("12.5")).toBe(12.5);
    expect(parseTime("1:02.5")).toBe(62.5);
    expect(parseTime("0:03")).toBe(3);
    expect(parseTime("1,5")).toBe(1.5);
    expect(parseTime("abc")).toBeNaN();
    expect(formatTime(62.54, 2)).toBe("1:02.54");
    expect(formatTime(4.5)).toBe("0:04.5");
  });
});
