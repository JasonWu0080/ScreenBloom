import type { Rect } from "@/lib/edit/types";

type Ctx = OffscreenCanvasRenderingContext2D;

/**
 * Crops a region out of a decoded (already rotated) frame and scales it to the output size.
 * Large reductions are done in halving steps with high-quality smoothing, which keeps small
 * UI text legible instead of aliasing it.
 */
export class FrameScaler {
  readonly canvas: OffscreenCanvas;
  readonly ctx: Ctx;
  private scratch: [OffscreenCanvas, Ctx][] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly source: Rect,
    readForPixels: boolean,
  ) {
    this.canvas = new OffscreenCanvas(width, height);
    const ctx = this.canvas.getContext("2d", { alpha: false, willReadFrequently: readForPixels });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  }

  private scratchCtx(i: number, w: number, h: number): [OffscreenCanvas, Ctx] {
    let entry = this.scratch[i];
    if (!entry) {
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("2D canvas unavailable");
      entry = [c, ctx];
      this.scratch[i] = entry;
    }
    if (entry[0].width < w || entry[0].height < h) {
      entry[0].width = Math.max(entry[0].width, w);
      entry[0].height = Math.max(entry[0].height, h);
    }
    entry[1].imageSmoothingEnabled = true;
    entry[1].imageSmoothingQuality = "high";
    return entry;
  }

  draw(frame: CanvasImageSource) {
    let src: CanvasImageSource = frame;
    let { x, y, width: w, height: h } = this.source;
    let flip = 0;
    while (w / 2 >= this.width && h / 2 >= this.height) {
      const tw = Math.ceil(w / 2);
      const th = Math.ceil(h / 2);
      const [c, ctx] = this.scratchCtx(flip, tw, th);
      ctx.drawImage(src, x, y, w, h, 0, 0, tw, th);
      src = c;
      x = 0;
      y = 0;
      w = tw;
      h = th;
      flip ^= 1;
    }
    this.ctx.drawImage(src, x, y, w, h, 0, 0, this.width, this.height);
  }

  pixels(): Uint8ClampedArray {
    return this.ctx.getImageData(0, 0, this.width, this.height).data;
  }

  dispose() {
    for (const [c] of this.scratch) {
      c.width = 1;
      c.height = 1;
    }
    this.scratch = [];
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
