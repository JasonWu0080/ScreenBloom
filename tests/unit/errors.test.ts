import { describe, expect, it } from "vitest";
import { isRetryable, type ErrorCode } from "@/lib/jobs/protocol";
import { JobError, classifyError } from "@/lib/media/errors";

describe("classifyError", () => {
  it("keeps explicit job errors and their detail", () => {
    expect(classifyError(new JobError("no_video"))).toEqual({ code: "no_video", detail: "" });
    expect(classifyError(new JobError("unsupported_codec", "hevc"))).toEqual({ code: "unsupported_codec", detail: "hevc" });
  });

  it("maps memory exhaustion to resources", () => {
    expect(classifyError(new RangeError("Array buffer allocation failed")).code).toBe("resources");
    expect(classifyError(new DOMException("quota", "QuotaExceededError")).code).toBe("resources");
  });

  it("maps demuxer / decoder failures to unreadable", () => {
    const e = new Error("bad");
    e.name = "UnsupportedInputFormatError";
    expect(classifyError(e, "failed").code).toBe("unreadable");
    expect(classifyError(new DOMException("decode", "EncodingError"), "failed").code).toBe("unreadable");
  });

  it("falls back to the caller's category and bounds the detail length", () => {
    const r = classifyError(new Error("x".repeat(1000)), "failed");
    expect(r.code).toBe("failed");
    expect(r.detail.length).toBeLessThanOrEqual(300);
    expect(classifyError("weird", "unreadable").code).toBe("unreadable");
  });
});

describe("isRetryable", () => {
  it("only offers retry where retrying can help", () => {
    const yes: ErrorCode[] = ["failed", "resources"];
    const no: ErrorCode[] = ["unreadable", "no_video", "empty", "unsupported_codec", "source_too_large", "mp4_unsupported", "load_failed", "browser_unsupported", "cancelled"];
    for (const c of yes) expect(isRetryable(c)).toBe(true);
    for (const c of no) expect(isRetryable(c)).toBe(false);
  });
});
