import type { EditParams, OutputFormat, SourceInfo } from "@/lib/edit/types";

/** User-facing error categories. Each maps to its own message in the UI. */
export type ErrorCode =
  | "unreadable" // not a media file, damaged, or container not understood
  | "no_video" // readable, but there is no video track
  | "empty" // zero duration / no decodable frames
  | "unsupported_codec" // the browser cannot decode this video codec
  | "source_too_large" // file size or frame size beyond local limits
  | "mp4_unsupported" // the browser cannot encode H.264
  | "resources" // ran out of memory or a similar local resource
  | "load_failed" // the processing module could not be loaded
  | "browser_unsupported" // required browser APIs are missing
  | "failed" // anything else during conversion
  | "cancelled";

/**
 * Errors where running the same export again (possibly with lighter settings) can succeed.
 * Others need a different file, browser or format, so the UI does not offer them as "retry".
 */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>(["failed", "resources"]);
export const isRetryable = (code: ErrorCode) => RETRYABLE.has(code);

export type Stage = "opening" | "analyzing" | "encoding" | "finalizing";

export type WorkerRequest =
  | { type: "probe"; file: File }
  | { type: "capabilities" }
  | { type: "export"; file: File; params: EditParams; source: SourceInfo };

export interface ExportResult {
  format: OutputFormat;
  mimeType: string;
  bytes: ArrayBuffer;
  width: number;
  height: number;
  /** Duration according to the encoder's own frame timing, seconds. */
  duration: number;
  /** Frames actually written (after merging identical GIF frames). */
  frames: number;
}

export interface Capabilities {
  mp4: boolean;
}

export type WorkerResponse =
  | { type: "ready" }
  | { type: "progress"; stage: Stage; done?: number; total?: number }
  | { type: "probe-result"; info: SourceInfo }
  | { type: "capabilities-result"; caps: Capabilities }
  | { type: "export-result"; result: ExportResult }
  | { type: "error"; code: ErrorCode; detail?: string };
