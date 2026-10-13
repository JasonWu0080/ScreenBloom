import { LIMITS } from "@/lib/config";
import type { AspectId, Rect } from "./types";

export const ASPECTS: AspectId[] = ["free", "original", "16:9", "1:1", "9:16"];

/** width / height ratio for an aspect preset, or null for free cropping. */
export function aspectRatio(aspect: AspectId, sourceW: number, sourceH: number): number | null {
  switch (aspect) {
    case "free":
      return null;
    case "original":
      return sourceW / sourceH;
    case "1:1":
      return 1;
    case "16:9":
      return 16 / 9;
    case "9:16":
      return 9 / 16;
  }
}

export function fullRect(sourceW: number, sourceH: number): Rect {
  return { x: 0, y: 0, width: sourceW, height: sourceH };
}

/** Largest rect with the given ratio that fits in the source, centered on `around` (or the frame). */
export function fitAspect(ratio: number, sourceW: number, sourceH: number, around?: Rect): Rect {
  let width = sourceW;
  let height = width / ratio;
  if (height > sourceH) {
    height = sourceH;
    width = height * ratio;
  }
  width = Math.round(width);
  height = Math.round(height);
  const cx = around ? around.x + around.width / 2 : sourceW / 2;
  const cy = around ? around.y + around.height / 2 : sourceH / 2;
  return clampRect({ x: Math.round(cx - width / 2), y: Math.round(cy - height / 2), width, height }, sourceW, sourceH);
}

/** Integer rect inside the frame, at least `minCropSize` (or the frame size if smaller). */
export function clampRect(r: Rect, sourceW: number, sourceH: number): Rect {
  const min = LIMITS.minCropSize;
  // Non-finite input (never produced by the UI, but possible in a crafted snapshot) falls back to the full frame.
  const f = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
  const width = Math.round(Math.min(sourceW, Math.max(Math.min(min, sourceW), f(r.width, sourceW))));
  const height = Math.round(Math.min(sourceH, Math.max(Math.min(min, sourceH), f(r.height, sourceH))));
  const x = Math.round(Math.min(sourceW - width, Math.max(0, f(r.x, 0))));
  const y = Math.round(Math.min(sourceH - height, Math.max(0, f(r.y, 0))));
  return { x, y, width, height };
}

export function isFullFrame(r: Rect, sourceW: number, sourceH: number): boolean {
  return r.x === 0 && r.y === 0 && r.width === sourceW && r.height === sourceH;
}

/** Scale between source pixels and on-screen CSS pixels of the preview. */
export interface ViewMapping {
  /** CSS px per source px. */
  scale: number;
}

export function toView(r: Rect, m: ViewMapping): Rect {
  return { x: r.x * m.scale, y: r.y * m.scale, width: r.width * m.scale, height: r.height * m.scale };
}

export function toSource(dx: number, m: ViewMapping): number {
  return dx / m.scale;
}

export type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * Applies a pointer drag (delta in source pixels) to a crop rect. With a fixed ratio,
 * corner handles keep the ratio and edges resize symmetrically around the other axis.
 * The result always stays inside the frame and respects the minimum size.
 */
export function dragRect(
  start: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  ratio: number | null,
  sourceW: number,
  sourceH: number,
): Rect {
  if (handle === "move") {
    return clampRect({ ...start, x: start.x + dx, y: start.y + dy }, sourceW, sourceH);
  }
  const min = Math.min(LIMITS.minCropSize, sourceW, sourceH);
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes("w")) left = Math.min(right - min, Math.max(0, left + dx));
  if (handle.includes("e")) right = Math.max(left + min, Math.min(sourceW, right + dx));
  if (handle.includes("n")) top = Math.min(bottom - min, Math.max(0, top + dy));
  if (handle.includes("s")) bottom = Math.max(top + min, Math.min(sourceH, bottom + dy));

  if (ratio == null) {
    return clampRect({ x: left, y: top, width: right - left, height: bottom - top }, sourceW, sourceH);
  }

  // Fixed ratio: derive the other dimension from the dragged one, anchored at the opposite side.
  let width = right - left;
  let height = bottom - top;
  const horizontalOnly = handle === "e" || handle === "w";
  const verticalOnly = handle === "n" || handle === "s";
  if (horizontalOnly) height = width / ratio;
  else if (verticalOnly) width = height * ratio;
  else if (width / height > ratio) width = height * ratio;
  else height = width / ratio;

  // Anchor: the fixed edges/corner stay put; edge drags grow symmetrically on the other axis.
  const anchorX = handle.includes("w") ? start.x + start.width : handle.includes("e") ? start.x : start.x + start.width / 2;
  const anchorY = handle.includes("n") ? start.y + start.height : handle.includes("s") ? start.y : start.y + start.height / 2;
  const maxW = handle.includes("w") ? anchorX : handle.includes("e") ? sourceW - anchorX : 2 * Math.min(anchorX, sourceW - anchorX);
  const maxH = handle.includes("n") ? anchorY : handle.includes("s") ? sourceH - anchorY : 2 * Math.min(anchorY, sourceH - anchorY);
  const shrink = Math.min(1, maxW / width, maxH / height);
  width *= shrink;
  height *= shrink;
  if (width < min || height < min) {
    const grow = Math.max(min / width, min / height);
    width *= grow;
    height *= grow;
  }
  const x = handle.includes("w") ? anchorX - width : handle.includes("e") ? anchorX : anchorX - width / 2;
  const y = handle.includes("n") ? anchorY - height : handle.includes("s") ? anchorY : anchorY - height / 2;
  return clampRect({ x, y, width, height }, sourceW, sourceH);
}

/** Applies typed-in values (source pixels) while honoring an aspect ratio. */
export function setRectField(
  r: Rect,
  field: keyof Rect,
  value: number,
  ratio: number | null,
  sourceW: number,
  sourceH: number,
): Rect {
  if (!Number.isFinite(value)) return r;
  const next = { ...r, [field]: value };
  if (ratio != null) {
    if (field === "width") next.height = value / ratio;
    if (field === "height") next.width = value * ratio;
    if (next.width > sourceW || next.height > sourceH) {
      const s = Math.min(sourceW / next.width, sourceH / next.height);
      next.width *= s;
      next.height *= s;
    }
  }
  return clampRect(next, sourceW, sourceH);
}
