import { LIMITS } from "@/lib/config";
import type { OutputFormat, Rect } from "./types";

export interface OutputSize {
  width: number;
  height: number;
  /**
   * The exact source region that is scaled into width×height. It is the user's crop,
   * trimmed by at most a pixel or two so its ratio matches the even output size exactly —
   * this is how we satisfy H.264's even-dimension rule without stretching content.
   */
  sourceRect: Rect;
}

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/**
 * Effective output size for a crop and requested width. Never upscales, keeps the crop's
 * ratio, respects per-format limits and produces even dimensions for both formats so GIF
 * and MP4 exports of the same edit are identical in size.
 */
export function computeOutputSize(crop: Rect, requestedWidth: number, format: OutputFormat): OutputSize {
  const ratio = crop.height / crop.width;
  let width = Math.min(requestedWidth, crop.width, LIMITS.maxOutputWidth[format]);
  const maxLong = LIMITS.maxOutputLongSide[format];
  if (width * ratio > maxLong) width = maxLong / ratio;
  // Respect the minimum side on whichever axis is shorter, without exceeding the crop.
  const minSide = Math.min(LIMITS.minOutputSide, crop.width, crop.height);
  if (width < minSide) width = minSide;
  if (width * ratio < minSide) width = minSide / ratio;
  width = even(Math.min(width, crop.width < 2 ? 2 : crop.width));
  const height = even(Math.round((width * ratio) / 2) * 2);

  const target = height / width;
  let sw = crop.width;
  let sh = crop.width * target;
  if (sh > crop.height) {
    sh = crop.height;
    sw = crop.height / target;
  }
  return {
    width,
    height,
    sourceRect: {
      x: crop.x + (crop.width - sw) / 2,
      y: crop.y + (crop.height - sh) / 2,
      width: sw,
      height: sh,
    },
  };
}

/** Width a preset asks for: its long side applied to the crop's orientation. */
export function widthForLongSide(crop: Rect, longSide: number): number {
  return crop.width >= crop.height ? longSide : Math.round((longSide * crop.width) / crop.height);
}
