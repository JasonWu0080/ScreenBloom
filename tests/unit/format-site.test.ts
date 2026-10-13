import { describe, expect, it } from "vitest";
import { PAGE_APIS, WORKER_APIS, missingApis } from "@/lib/capabilities";
import { downloadName, formatBytes, formatDuration, formatTime, parseTime } from "@/lib/format";
import { shortCommit } from "@/lib/site";

describe("formatting", () => {
  it("formats byte sizes like the result panel", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(200 * 1024)).toBe("200 KB");
    expect(formatBytes(1.5 * 1024 ** 2)).toBe("1.50 MB");
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.00 GB");
  });

  it("formats times and short durations", () => {
    expect(formatTime(83.25)).toBe("1:23.3");
    expect(formatTime(4.5, 2)).toBe("0:04.50");
    expect(formatTime(-1)).toBe("0:00.0");
    expect(formatTime(Number.NaN)).toBe("0:00.0");
    expect(formatDuration(3)).toBe("3.00 s");
    expect(formatDuration(12.345)).toBe("12.3 s");
    expect(formatDuration(65)).toBe("1:05.0");
  });

  it("parses typed times and rejects garbage", () => {
    expect(parseTime("1:02:03.5")).toBe(3723.5);
    expect(parseTime(".5")).toBe(0.5);
    expect(parseTime("1：02，5")).toBe(62.5); // full-width separators from Chinese IMEs
    for (const bad of ["", "abc", "1:2:3:4", "-1", "1e3"]) expect(parseTime(bad)).toBeNaN();
  });

  it("builds safe download names", () => {
    expect(downloadName("demo.mov", "gif", 960, 540)).toBe("demo-960x540.gif");
    expect(downloadName('a/b:c*?"<>|.mp4', "mp4", 2, 2)).toBe("a_b_c_-2x2.mp4");
    expect(downloadName(".mp4", "gif", 10, 10)).toBe("clip-10x10.gif");
    expect(downloadName("x".repeat(200) + ".mp4", "gif", 1, 1)).toHaveLength(80 + "-1x1.gif".length);
  });
});

describe("capability detection", () => {
  class Canvas2D {
    getContext() {
      return {};
    }
  }
  class CanvasNo2D {
    getContext() {
      return null;
    }
  }
  const all = { Worker: 1, VideoDecoder: 1, EncodedVideoChunk: 1, VideoFrame: 1, OffscreenCanvas: Canvas2D };
  const without = (...names: string[]) => Object.fromEntries(Object.entries(all).filter(([k]) => !names.includes(k)));

  it("reports nothing when every API exists", () => {
    expect(missingApis(all)).toEqual([]);
  });

  it("names exactly the missing APIs", () => {
    expect(missingApis(without("VideoDecoder", "VideoFrame"))).toEqual(["VideoDecoder", "VideoFrame"]);
  });

  it("detects OffscreenCanvas without a 2D context", () => {
    expect(missingApis({ ...all, OffscreenCanvas: CanvasNo2D })).toEqual(["OffscreenCanvas 2D"]);
  });

  it("does not require Worker inside the worker", () => {
    expect(missingApis(without("Worker"), WORKER_APIS)).toEqual([]);
    expect(PAGE_APIS).toContain("Worker");
    expect(WORKER_APIS).not.toContain("Worker");
  });
});

describe("build identity", () => {
  it("shortens full SHAs and keeps the dirty marker", () => {
    expect(shortCommit("244036472d68c830b47ac9f82f12992a3a68a620")).toBe("2440364");
    expect(shortCommit("244036472d68c830b47ac9f82f12992a3a68a620-dirty")).toBe("2440364-dirty");
    expect(shortCommit("unknown")).toBe("unknown");
  });
});
