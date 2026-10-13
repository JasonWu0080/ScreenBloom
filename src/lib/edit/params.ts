import { LIMITS } from "@/lib/config";
import { ASPECTS, aspectRatio, clampRect, fitAspect, fullRect } from "./crop";
import { computeOutputSize, widthForLongSide } from "./output";
import { planGifFrames, totalOutputDuration } from "./timeline";
import type { AspectId, EditParams, Mp4Quality, OutputFormat, PresetId, SourceInfo } from "./types";

export interface PresetValues {
  /** Longest output side; converted to a width for the current crop. */
  longSide: number;
  fps: number;
  gifColors: number;
  gifDither: boolean;
  mp4Quality: Mp4Quality;
}

/**
 * Real parameter combinations, tuned on text-heavy screen recordings:
 * - small: half-res-ish, 10 fps, 128 colors — readable UI text, smallest files.
 * - balanced: 960 px, 15 fps, full palette — the default for docs and changelogs.
 * - hd: 1280 px, 24 fps, full palette + light ordered dithering for gradients.
 */
export const PRESETS: Record<PresetId, PresetValues> = {
  small: { longSide: 640, fps: 10, gifColors: 128, gifDither: false, mp4Quality: "low" },
  balanced: { longSide: 960, fps: 15, gifColors: 256, gifDither: false, mp4Quality: "medium" },
  hd: { longSide: 1280, fps: 24, gifColors: 256, gifDither: true, mp4Quality: "high" },
};
export const PRESET_IDS: PresetId[] = ["small", "balanced", "hd"];
export const DEFAULT_PRESET: PresetId = "balanced";

export const OUTPUT_FORMATS: OutputFormat[] = ["gif", "mp4"];
export const MP4_QUALITIES: Mp4Quality[] = ["low", "medium", "high"];

export const FPS_OPTIONS =[5, 8, 10, 12, 15, 20, 24, 30];
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** Bits per pixel per frame for MP4, by quality. Screen content compresses very well. */
export const MP4_BPP: Record<Mp4Quality, number> = { low: 0.05, medium: 0.08, high: 0.14 };

export function mp4Bitrate(width: number, height: number, fps: number, q: Mp4Quality): number {
  return Math.round(Math.min(16e6, Math.max(250e3, width * height * fps * MP4_BPP[q])));
}

export function applyPreset(p: EditParams, id: PresetId): EditParams {
  const v = PRESETS[id];
  return {
    ...p,
    preset: id,
    outputWidth: widthForLongSide(p.crop, v.longSide),
    fps: v.fps,
    gifColors: v.gifColors,
    gifDither: v.gifDither,
    mp4Quality: v.mp4Quality,
  };
}

/** Which preset (if any) the current values correspond to; manual edits become "custom". */
export function detectPreset(p: EditParams): PresetId | "custom" {
  for (const id of PRESET_IDS) {
    const v = PRESETS[id];
    if (
      p.outputWidth === widthForLongSide(p.crop, v.longSide) &&
      p.fps === v.fps &&
      p.gifColors === v.gifColors &&
      p.gifDither === v.gifDither &&
      p.mp4Quality === v.mp4Quality
    )
      return id;
  }
  return "custom";
}

export function defaultParams(src: SourceInfo, format: OutputFormat = "gif"): EditParams {
  const base: EditParams = {
    start: 0,
    end: src.duration,
    crop: fullRect(src.width, src.height),
    aspect: "free",
    outputWidth: src.width,
    fps: 15,
    speed: 1,
    holdStart: 0,
    holdEnd: 0,
    format,
    gifLoop: 0,
    preset: DEFAULT_PRESET,
    gifColors: 256,
    gifDither: false,
    mp4Quality: "medium",
  };
  return applyPreset(base, DEFAULT_PRESET);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
const oneOf = <T>(v: T, allowed: readonly T[], fallback: T): T => (allowed.includes(v) ? v : fallback);

/**
 * Brings any (possibly user-typed) values back into valid ranges. Idempotent. The UI runs it
 * after every edit and the worker runs it again on the snapshot it receives, so both sides
 * enforce exactly the same rules.
 */
export function normalizeParams(p: EditParams, src: SourceInfo): EditParams {
  const minClip = Math.min(LIMITS.minClipSeconds, src.duration);
  let start = clamp(finite(p.start, 0), 0, Math.max(0, src.duration - minClip));
  let end = clamp(finite(p.end, src.duration), 0, src.duration);
  if (end - start < minClip) {
    end = Math.min(src.duration, start + minClip);
    start = Math.max(0, end - minClip);
  }
  const aspect = oneOf(p.aspect, ASPECTS, "free");
  let crop = clampRect(p.crop, src.width, src.height);
  const ratio = aspectRatio(aspect, src.width, src.height);
  if (ratio != null && Math.abs(crop.width / crop.height - ratio) > 0.02) crop = fitAspect(ratio, src.width, src.height, crop);
  return {
    ...p,
    start,
    end,
    crop,
    aspect,
    format: oneOf(p.format, OUTPUT_FORMATS, "gif"),
    preset: oneOf(p.preset, [...PRESET_IDS, "custom"], "custom"),
    gifDither: p.gifDither === true,
    mp4Quality: oneOf(p.mp4Quality, MP4_QUALITIES, "medium"),
    outputWidth: Math.round(clamp(finite(p.outputWidth, crop.width), LIMITS.minOutputSide, LIMITS.maxOutputWidth.mp4 * 4)),
    fps: Math.round(clamp(finite(p.fps, 15), LIMITS.fps.min, LIMITS.fps.max)),
    speed: clamp(finite(p.speed, 1), LIMITS.speed.min, LIMITS.speed.max),
    holdStart: Math.round(clamp(finite(p.holdStart, 0), LIMITS.hold.min, LIMITS.hold.max) * 10) / 10,
    holdEnd: Math.round(clamp(finite(p.holdEnd, 0), LIMITS.hold.min, LIMITS.hold.max) * 10) / 10,
    gifLoop: Math.round(clamp(finite(p.gifLoop, 0), 0, LIMITS.gifLoopMaxPlays)),
    gifColors: Math.round(clamp(finite(p.gifColors, 256), 16, 256)),
  };
}

export function setAspect(p: EditParams, aspect: AspectId, src: SourceInfo): EditParams {
  const ratio = aspectRatio(aspect, src.width, src.height);
  const crop = ratio == null ? p.crop : aspect === "original" ? fullRect(src.width, src.height) : fitAspect(ratio, src.width, src.height, p.crop);
  return withCrop({ ...p, aspect }, crop);
}

/** Changing the crop keeps the preset's long side meaningful for the new orientation. */
export function withCrop(p: EditParams, crop: EditParams["crop"]): EditParams {
  const next = { ...p, crop };
  if (p.preset !== "custom") next.outputWidth = widthForLongSide(crop, PRESETS[p.preset].longSide);
  return next;
}

export type LimitIssue =
  | { kind: "duration"; max: number; actual: number }
  | { kind: "frames"; max: number; actual: number };

/** Checks that must pass before a (potentially long) export starts. */
export function checkLimits(p: EditParams): LimitIssue[] {
  const issues: LimitIssue[] = [];
  const total = totalOutputDuration(p);
  const maxDur = LIMITS.maxOutputSeconds[p.format];
  if (total > maxDur + 1e-6) issues.push({ kind: "duration", max: maxDur, actual: total });
  if (p.format === "gif") {
    const frames = planGifFrames(p).length;
    if (frames > LIMITS.maxGifFrames) issues.push({ kind: "frames", max: LIMITS.maxGifFrames, actual: frames });
  }
  return issues;
}

export function outputSizeFor(p: EditParams) {
  return computeOutputSize(p.crop, p.outputWidth, p.format);
}
