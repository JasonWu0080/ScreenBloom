import { quantize } from "gifenc";

/**
 * Builds one global palette from frames sampled across the clip. A single palette keeps
 * colors stable from frame to frame (no flicker) and lets unchanged pixels be skipped.
 * `maxColors` excludes the transparent slot, which the caller appends.
 */
export function buildPalette(samples: Uint8ClampedArray[], maxColors: number, pixelBudget = 2_000_000): number[][] {
  const total = samples.reduce((n, s) => n + s.length / 4, 0);
  const stride = Math.max(1, Math.ceil(total / pixelBudget));
  const picked = new Uint8Array(Math.ceil(total / stride) * 4 + 4);
  let o = 0;
  for (const s of samples) {
    const px = s.length / 4;
    for (let i = 0; i < px; i += stride) {
      const j = i * 4;
      picked[o++] = s[j];
      picked[o++] = s[j + 1];
      picked[o++] = s[j + 2];
      picked[o++] = 255;
    }
  }
  const palette = quantize(picked.subarray(0, o), maxColors, { format: "rgb565" });
  return palette.map((c) => [c[0], c[1], c[2]]);
}

// 8×8 Bayer matrix, values 0..63.
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

/** Colors closer than this (weighted squared distance) to a palette entry are never dithered. */
const DITHER_ERROR_THRESHOLD = 27;
const DITHER_AMPLITUDE = 16;

/**
 * Maps RGBA pixels to palette indices. Results are cached per 7-bit-per-channel color for
 * the whole job, so the same color always maps to the same index (temporal stability).
 *
 * Dithering is ordered (Bayer), not error diffusion: it is position-based, so static areas
 * stay identical between frames and do not shimmer. It is applied only to colors the
 * palette represents poorly (gradients, photos) — flat UI colors and text stay crisp.
 */
export class PaletteMapper {
  private readonly pal: Int32Array;
  private readonly n: number;
  private readonly cache = new Int16Array(1 << 21).fill(-1);
  /** 1 = color is poorly represented → eligible for dithering. Valid where cache >= 0. */
  private readonly rough = new Uint8Array(1 << 21);

  constructor(
    palette: number[][],
    private readonly dither: boolean,
  ) {
    this.n = palette.length;
    this.pal = new Int32Array(palette.length * 3);
    palette.forEach((c, i) => {
      this.pal[i * 3] = c[0];
      this.pal[i * 3 + 1] = c[1];
      this.pal[i * 3 + 2] = c[2];
    });
  }

  private lookup(r: number, g: number, b: number): number {
    const key = ((r >> 1) << 14) | ((g >> 1) << 7) | (b >> 1);
    const hit = this.cache[key];
    if (hit >= 0) return hit;
    const pal = this.pal;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.n; i++) {
      const dr = pal[i * 3] - r;
      const dg = pal[i * 3 + 1] - g;
      const db = pal[i * 3 + 2] - b;
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < bestD) {
        bestD = d;
        best = i;
        if (d === 0) break;
      }
    }
    this.cache[key] = best;
    this.rough[key] = bestD > DITHER_ERROR_THRESHOLD ? 1 : 0;
    return best;
  }

  map(rgba: Uint8ClampedArray, width: number, height: number, out: Uint8Array) {
    const dither = this.dither;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      const by = (y & 7) << 3;
      for (let x = 0; x < width; x++) {
        const p = row + x;
        const j = p * 4;
        const r = rgba[j];
        const g = rgba[j + 1];
        const b = rgba[j + 2];
        let idx = this.lookup(r, g, b);
        if (dither && this.rough[((r >> 1) << 14) | ((g >> 1) << 7) | (b >> 1)]) {
          const t = ((BAYER8[by | (x & 7)] + 0.5) / 64 - 0.5) * DITHER_AMPLITUDE;
          idx = this.lookup(clamp8(r + t), clamp8(g + t), clamp8(b + t));
        }
        out[p] = idx;
      }
    }
  }
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}
