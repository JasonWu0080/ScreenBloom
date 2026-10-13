// Pixel-level regression tests for the whole GIF pipeline (global palette → color mapping →
// frame differencing → GIF89a/LZW), on synthetic frames that mimic screen recordings.
// Every output is decoded with an independent decoder and compared frame by frame, which
// catches flicker, ghosting (stale pixels), wrong transparency, wrong regions and timing drift.
import { describe, expect, it } from "vitest";
import { GifAnimator } from "@/lib/encode/gif/animator";
import { PaletteMapper, buildPalette } from "@/lib/encode/gif/palette";
import { GifWriter } from "@/lib/encode/gif/writer";
import { decodeGif } from "./gif-decoder";

type RGB = [number, number, number];
const W = 160;
const H = 90;

function frame(fn: (x: number, y: number) => RGB): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = fn(x, y);
      const j = (y * W + x) * 4;
      px[j] = r;
      px[j + 1] = g;
      px[j + 2] = b;
      px[j + 3] = 255;
    }
  return px;
}

/** Mirrors exportGif in src/lib/encode/export.ts (sampling, transparent slot, mapping). */
function encode(frames: Uint8ClampedArray[], delays: number[], { colors = 256, dither = false } = {}) {
  const k = Math.min(12, frames.length);
  const samples = Array.from({ length: k }, (_, i) => frames[Math.floor(((i + 0.5) * frames.length) / k)]);
  const palette = buildPalette(samples, Math.min(255, colors - 1));
  const anim = new GifAnimator(new GifWriter(W, H, [...palette, [0, 0, 0]], 0), W, H, palette.length);
  const mapper = new PaletteMapper(palette, dither);
  const mapped = frames.map((f, i) => {
    const idx = new Uint8Array(W * H);
    mapper.map(f, W, H, idx);
    anim.add(idx, delays[i]);
    return idx;
  });
  const gif = decodeGif(anim.finish());
  return { gif, mapped, palette, written: anim.framesWritten };
}

/** Consecutive identical frames collapse into one (with summed delay). */
function collapse(mapped: Uint8Array[], delays: number[]) {
  const out: { idx: Uint8Array; delay: number }[] = [];
  mapped.forEach((m, i) => {
    const last = out[out.length - 1];
    if (last && Buffer.from(last.idx).equals(Buffer.from(m))) last.delay += delays[i];
    else out.push({ idx: m, delay: delays[i] });
  });
  return out;
}

/** Decoded frames must equal the mapped input frames exactly: no ghosting, no wrong transparency. */
function expectFaithful(r: ReturnType<typeof encode>, delays: number[]) {
  const expected = collapse(r.mapped, delays);
  expect(r.gif.frames).toHaveLength(expected.length);
  r.gif.frames.forEach((f, i) => {
    expect(Buffer.from(f.canvas).equals(Buffer.from(expected[i].idx))).toBe(true);
    expect(f.delay).toBe(expected[i].delay);
    // the transparent slot must never end up visible on the canvas
    expect(f.canvas.includes(r.palette.length)).toBe(false);
  });
  expect(r.gif.frames.reduce((s, f) => s + f.delay, 0)).toBe(delays.reduce((s, d) => s + d, 0));
}

const colorAt = (r: ReturnType<typeof encode>, idx: number): RGB => r.palette[idx] as RGB;
const dist = (a: RGB, b: RGB) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

// A simple "app window": sidebar, header, cards and text-like stripes.
function ui(x: number, y: number, scroll = 0): RGB {
  if (x < 30) return [255, 255, 255];
  if (y < 12) return [79, 70, 229];
  const yy = y + scroll;
  if (yy % 20 < 2) return [227, 229, 232];
  if (yy % 20 > 6 && yy % 20 < 9 && (x * 7 + yy) % 11 < 6) return [31, 35, 40]; // "text"
  return [246, 247, 249];
}

describe("GIF pipeline on screen-recording-like content", () => {
  it("static UI: identical frames merge into one, colors are exact", () => {
    const f = frame((x, y) => ui(x, y));
    const delays = Array(30).fill(7);
    const r = encode(Array(30).fill(f), delays);
    expect(r.written).toBe(1);
    expectFaithful(r, delays);
    // flat UI colors are represented exactly by the palette (few distinct colors)
    for (const [x, y] of [
      [5, 50],
      [60, 5],
      [60, 50],
    ])
      expect(dist(colorAt(r, r.gif.frames[0].canvas[y * W + x]), ui(x, y))).toBe(0);
  });

  it("mouse movement: only the cursor's bounding box is re-encoded, no trail is left behind", () => {
    const frames: Uint8ClampedArray[] = [];
    for (let i = 0; i < 12; i++) {
      const cx = 40 + i * 9;
      const cy = 30 + ((i * 5) % 40);
      frames.push(frame((x, y) => (Math.abs(x - cx) < 3 && Math.abs(y - cy) < 3 ? [239, 68, 68] : ui(x, y))));
    }
    const delays = Array(12).fill(7);
    const r = encode(frames, delays);
    expectFaithful(r, delays);
    for (const f of r.gif.frames.slice(1)) {
      // the union of the old and new cursor positions, never the whole frame
      expect(f.w).toBeLessThanOrEqual(5 + 9 + 1);
      expect(f.h).toBeLessThanOrEqual(5 + 40);
      expect(f.transparent).toBe(r.palette.length);
    }
  });

  it("page scrolling: content below the header changes, header stays untouched", () => {
    const frames = Array.from({ length: 10 }, (_, i) => frame((x, y) => ui(x, y, i * 3)));
    const delays = Array(10).fill(10);
    const r = encode(frames, delays);
    expectFaithful(r, delays);
    for (const f of r.gif.frames.slice(1)) expect(f.y).toBeGreaterThanOrEqual(12);
  });

  it("gradient with dithering: static frames stay identical (no shimmer) and flat areas stay undithered", () => {
    const grad = frame((x, y) => (y < 20 ? [246, 247, 249] : [Math.round((x / W) * 255), 120, Math.round((y / H) * 255)]));
    const delays = Array(8).fill(7);
    const r = encode(Array(8).fill(grad), delays, { colors: 32, dither: true });
    expect(r.written).toBe(1); // ordered dithering is position-based → frames identical → merged
    expectFaithful(r, delays);
    const flat = r.gif.frames[0].canvas.subarray(0, 20 * W);
    expect(new Set(flat).size).toBe(1);
  });

  it("text: high-contrast 1 px detail survives quantization", () => {
    const text = frame((x, y) => ((x + y * 3) % 5 === 0 && y > 20 && y < 70 ? [0, 0, 0] : [255, 255, 255]));
    const r = encode([text], [100]);
    expectFaithful(r, [100]);
    const c = r.gif.frames[0].canvas;
    for (let y = 21; y < 70; y += 7)
      for (let x = 0; x < W; x += 13) {
        const want: RGB = (x + y * 3) % 5 === 0 ? [0, 0, 0] : [255, 255, 255];
        expect(dist(colorAt(r, c[y * W + x]), want)).toBeLessThanOrEqual(8);
      }
  });

  it("high-frequency animation (noise every frame) round-trips exactly", () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24;
    const frames = Array.from({ length: 6 }, () => frame(() => [rnd(), rnd(), rnd()]));
    const delays = [7, 7, 6, 7, 7, 6];
    const r = encode(frames, delays);
    expectFaithful(r, delays);
    expect(r.palette.length).toBeLessThanOrEqual(255);
  });

  it("long still section between changes keeps total time exact", () => {
    const a = frame((x, y) => ui(x, y));
    const b = frame((x, y) => (x > 100 && y > 60 ? [34, 197, 94] : ui(x, y)));
    const frames = [a, ...Array(200).fill(a), b, ...Array(50).fill(b)];
    const delays = frames.map((_, i) => (i % 3 === 2 ? 6 : 7));
    const r = encode(frames, delays);
    expect(r.written).toBe(2);
    expectFaithful(r, delays);
    expect(r.gif.frames[1]).toMatchObject({ x: 101, y: 61 });
  });
});

describe("frame differencing under complex motion (ghosting regression)", () => {
  // Several sprites move on different paths, overlap each other, and pixels return to the
  // color they had two frames earlier. Unchanged-vs-previous pixels become transparent, so any
  // bookkeeping error in the previous-frame buffer shows up as stale pixels (ghosts) here.
  const sprites = (t: number) => [
    { x: (t * 7) % (W - 20), y: 20 + Math.round(10 * Math.sin(t / 2)), s: 18, c: [220, 38, 38] as RGB },
    { x: W - 24 - ((t * 5) % (W - 24)), y: 40, s: 22, c: [22, 163, 74] as RGB },
    { x: 60 + Math.round(30 * Math.cos(t / 3)), y: 30 + ((t * 3) % 40), s: 14, c: [37, 99, 235] as RGB },
  ];
  const scene = (t: number) =>
    frame((x, y) => {
      for (const sp of sprites(t)) if (x >= sp.x && x < sp.x + sp.s && y >= sp.y && y < sp.y + sp.s) return sp.c;
      return ui(x, y);
    });

  it("overlapping moving objects decode exactly, frame by frame", () => {
    const frames = Array.from({ length: 40 }, (_, t) => scene(t));
    const delays = frames.map(() => 7);
    const r = encode(frames, delays);
    expectFaithful(r, delays);
  });

  it("A → B → A (pixels revert to an older value) leaves no stale pixels", () => {
    const a = scene(0);
    const b = scene(9);
    const frames = [a, b, a, b, b, a, scene(3), a];
    const delays = [5, 5, 5, 5, 5, 5, 5, 5];
    const r = encode(frames, delays);
    expectFaithful(r, delays);
  });

  it("an object leaving the frame restores the background completely", () => {
    const frames = [scene(0), scene(1), frame(ui), frame(ui), scene(2)];
    const delays = [10, 10, 10, 10, 10];
    const r = encode(frames, delays);
    expectFaithful(r, delays);
    expect(r.written).toBe(4); // the two identical background frames merge
  });
});

describe("PaletteMapper", () => {
  it("is deterministic: the same color always maps to the same index", () => {
    const pal = Array.from({ length: 64 }, (_, i) => [i * 4, 255 - i * 4, (i * 37) & 255]);
    const m = new PaletteMapper(pal, false);
    const px = frame((x, y) => [(x * 13) & 255, (y * 29) & 255, (x * y) & 255]);
    const a = new Uint8Array(W * H);
    const b = new Uint8Array(W * H);
    m.map(px, W, H, a);
    m.map(px, W, H, b);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Math.max(...a)).toBeLessThan(64);
  });

  it("exact palette colors are never dithered", () => {
    const pal = [
      [0, 0, 0],
      [255, 255, 255],
      [47, 91, 211],
    ];
    const m = new PaletteMapper(pal, true);
    const px = frame((x) => pal[x % 3] as RGB);
    const out = new Uint8Array(W * H);
    m.map(px, W, H, out);
    out.forEach((v, i) => expect(v).toBe(i % W % 3));
  });
});
