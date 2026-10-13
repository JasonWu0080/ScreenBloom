import { GifWriter, type GifFrameRegion } from "./writer";

/**
 * Turns a sequence of full-frame index buffers into an optimized animation:
 * - identical consecutive frames are merged (their delays add up), which is very common in
 *   screen recordings with pauses;
 * - each written frame only covers the bounding box of changed pixels, and unchanged pixels
 *   inside it are transparent, so static UI costs almost nothing.
 * Total display time is preserved exactly because delays are only ever summed.
 */
export class GifAnimator {
  private prev: Uint8Array | null = null;
  private pending: GifFrameRegion | null = null;
  private written = 0;

  constructor(
    private readonly writer: GifWriter,
    private readonly width: number,
    private readonly height: number,
    private readonly transparentIndex: number,
  ) {}

  get framesWritten() {
    return this.written;
  }

  add(indices: Uint8Array, delayCs: number) {
    const { width, height } = this;
    if (!this.prev) {
      this.prev = indices.slice();
      this.pending = { x: 0, y: 0, width, height, indices: this.prev.slice(), delayCs, transparentIndex: null };
      return;
    }
    const prev = this.prev;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (indices[row + x] !== prev[row + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          maxY = y;
        }
      }
    }
    if (maxX < 0) {
      this.pending!.delayCs += delayCs;
      return;
    }
    this.flush();
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const region = new Uint8Array(w * h);
    const t = this.transparentIndex;
    for (let y = 0; y < h; y++) {
      const src = (minY + y) * width + minX;
      const dst = y * w;
      for (let x = 0; x < w; x++) {
        const v = indices[src + x];
        region[dst + x] = v === prev[src + x] ? t : v;
        prev[src + x] = v;
      }
    }
    this.pending = { x: minX, y: minY, width: w, height: h, indices: region, delayCs, transparentIndex: t };
  }

  private flush() {
    if (!this.pending) return;
    // Split delays beyond the GIF maximum (655.35 s) — not reachable with current limits.
    while (this.pending.delayCs > 65535) {
      this.writer.frame({ ...this.pending, delayCs: 65535 });
      this.pending = { ...this.pending, x: 0, y: 0, width: 1, height: 1, indices: new Uint8Array([this.transparentIndex]), delayCs: this.pending.delayCs - 65535, transparentIndex: this.transparentIndex };
      this.written++;
    }
    this.writer.frame(this.pending);
    this.written++;
    this.pending = null;
  }

  finish(): Uint8Array {
    this.flush();
    return this.writer.finish();
  }
}
