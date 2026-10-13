import type { ErrorCode } from "@/lib/jobs/protocol";

export class JobError extends Error {
  constructor(
    readonly code: ErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

/** Maps exceptions thrown by decoders, encoders and the demuxer to user-facing categories. */
export function classifyError(e: unknown, fallback: ErrorCode = "failed"): { code: ErrorCode; detail: string } {
  if (e instanceof JobError) return { code: e.code, detail: e.message === e.code ? "" : e.message };
  const name = e instanceof Error || e instanceof DOMException ? e.name : "";
  const message = e instanceof Error || e instanceof DOMException ? e.message : String(e);
  const detail = `${name}: ${message}`.slice(0, 300);
  if (/memory|allocation failed|out of memory|QuotaExceeded/i.test(message) || name === "QuotaExceededError" || (e instanceof RangeError && /array buffer|length/i.test(message))) {
    return { code: "resources", detail };
  }
  if (name === "UnsupportedInputFormatError") return { code: "unreadable", detail };
  if (name === "EncodingError" && fallback === "failed") return { code: "unreadable", detail };
  return { code: fallback, detail };
}
