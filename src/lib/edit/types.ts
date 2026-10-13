export type OutputFormat = "gif" | "mp4";
export type PresetId = "small" | "balanced" | "hd";
export type AspectId = "free" | "original" | "1:1" | "16:9" | "9:16";
export type Mp4Quality = "low" | "medium" | "high";

/** Rectangle in source display pixels (rotation already applied, origin top-left). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The single source of truth for "what to export". The editor UI edits it; the worker
 * receives a snapshot of it. All times are seconds on the source timeline.
 */
export interface EditParams {
  start: number;
  end: number;
  crop: Rect;
  aspect: AspectId;
  /** Requested width; the effective size comes from `computeOutputSize`. */
  outputWidth: number;
  fps: number;
  /** Playback speed multiplier, 2 = twice as fast. */
  speed: number;
  /** Seconds to hold the first / last frame. */
  holdStart: number;
  holdEnd: number;
  format: OutputFormat;
  /** 0 = loop forever, N >= 1 = play N times in total then stop on the last frame. */
  gifLoop: number;
  preset: PresetId | "custom";
  gifColors: number;
  gifDither: boolean;
  mp4Quality: Mp4Quality;
}

/** What we learned about the uploaded file by actually opening and decoding it. */
export interface SourceInfo {
  fileName: string;
  fileSize: number;
  /** Container reported by the demuxer, e.g. "MP4", "QuickTime", "WebM". */
  container: string;
  codec: string;
  /** End timestamp of the video track, seconds. */
  duration: number;
  /** Timestamp of the first frame (usually 0). */
  firstTimestamp: number;
  /** Display size, rotation applied. */
  width: number;
  height: number;
  codedWidth: number;
  codedHeight: number;
  rotation: 0 | 90 | 180 | 270;
  /** Average frames per second measured from packets (VFR files report the mean). */
  averageFps: number;
  hasAudio: boolean;
}
