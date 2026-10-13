import { describe, expect, it } from "vitest";
import { GifAnimator } from "@/lib/encode/gif/animator";
import { GifWriter } from "@/lib/encode/gif/writer";
import { decodeGif } from "./gif-decoder";

const palette = Array.from({ length: 200 }, (_, i) => [i, 255 - i, (i * 7) & 255]);

describe("GIF writer", () => {
  it("round-trips large noisy frames (exercises LZW table resets)", () => {
    const w = 300;
    const h = 200;
    const writer = new GifWriter(w, h, [...palette, [0, 0, 0]], 0);
    const anim = new GifAnimator(writer, w, h, 200);
    let seed = 1;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) % 200;
    const frames: Uint8Array[] = [];
    for (let f = 0; f < 3; f++) {
      const idx = new Uint8Array(w * h);
      for (let i = 0; i < idx.length; i++) idx[i] = f === 1 && i < w * 50 ? frames[0][i] : rnd();
      frames.push(idx);
      anim.add(idx, 7);
    }
    const g = decodeGif(anim.finish());
    expect(g.sig).toBe("GIF89a");
    expect([g.width, g.height]).toEqual([300, 200]);
    expect(g.loop).toBe(0);
    expect(g.frames).toHaveLength(3);
    g.frames.forEach((fr, i) => expect(Buffer.from(fr.canvas).equals(Buffer.from(frames[i]))).toBe(true));
    // second frame only re-encodes the changed region (rows 50..199)
    expect(g.frames[1].y).toBe(50);
    expect(g.frames[1].dispose).toBe(1);
  });

  it("merges identical frames and keeps the total delay", () => {
    const w = 40;
    const h = 30;
    const anim = new GifAnimator(new GifWriter(w, h, [...palette, [0, 0, 0]], 3), w, h, 200);
    const a = new Uint8Array(w * h).fill(5);
    const b = a.slice();
    b[w * 10 + 20] = 9;
    anim.add(a, 107);
    anim.add(a, 7);
    anim.add(a, 6);
    anim.add(b, 7);
    anim.add(b, 250);
    const g = decodeGif(anim.finish());
    expect(g.frames.map((f) => f.delay)).toEqual([120, 257]);
    expect(g.frames[1]).toMatchObject({ x: 20, y: 10, w: 1, h: 1 });
    expect(g.loop).toBe(2); // "play 3 times" = 2 repeats after the first play
  });

  it("writes no loop block for play-once", () => {
    const anim = new GifAnimator(new GifWriter(4, 4, [...palette, [0, 0, 0]], 1), 4, 4, 200);
    anim.add(new Uint8Array(16), 10);
    expect(decodeGif(anim.finish()).loop).toBeNull();
  });

  it("handles a 1-color palette", () => {
    const anim = new GifAnimator(new GifWriter(8, 8, [[255, 255, 255], [0, 0, 0]], 0), 8, 8, 1);
    anim.add(new Uint8Array(64), 10);
    const g = decodeGif(anim.finish());
    expect(g.frames[0].canvas.every((v) => v === 0)).toBe(true);
  });
});

describe("GIF89a structure", () => {
  it("writes header, logical screen and a power-of-two global color table", () => {
    const pal = Array.from({ length: 100 }, (_, i) => [i, i, i]);
    const anim = new GifAnimator(new GifWriter(17, 9, [...pal, [0, 0, 0]], 0), 17, 9, 100);
    anim.add(new Uint8Array(17 * 9).fill(3), 10);
    const bytes = anim.finish();
    const g = decodeGif(bytes);
    expect(g.sig).toBe("GIF89a");
    expect([g.width, g.height]).toEqual([17, 9]);
    // global table flag, 7 bits → 128 entries (101 used, rest padded black)
    expect(g.flags & 0x80).toBe(0x80);
    expect(g.flags & 7).toBe(6);
    expect(g.palette.length).toBe(128 * 3);
    expect([...g.palette.subarray(3 * 99, 3 * 100)]).toEqual([99, 99, 99]);
    expect([...g.palette.subarray(3 * 127)]).toEqual([0, 0, 0]);
    expect(bytes[bytes.length - 1]).toBe(0x3b); // trailer
  });

  it("first frame is opaque and full-size; later frames use disposal 1 + transparency", () => {
    const w = 10;
    const h = 6;
    const anim = new GifAnimator(new GifWriter(w, h, [...palette, [0, 0, 0]], 0), w, h, 200);
    const a = new Uint8Array(w * h).fill(1);
    const b = a.slice();
    b[2 * w + 3] = 2;
    b[4 * w + 7] = 2;
    anim.add(a, 10);
    anim.add(b, 10);
    const g = decodeGif(anim.finish());
    expect(g.frames[0]).toMatchObject({ x: 0, y: 0, w, h, transparent: null, dispose: 1, imgFlags: 0 });
    // bounding box of the two changed pixels; unchanged pixels inside it are transparent
    expect(g.frames[1]).toMatchObject({ x: 3, y: 2, w: 5, h: 3, transparent: 200, dispose: 1, imgFlags: 0 });
    expect(Buffer.from(g.frames[1].canvas).equals(Buffer.from(b))).toBe(true);
  });

  it("uses the GIF minimum LZW code size of 2 for tiny palettes", () => {
    const anim = new GifAnimator(new GifWriter(5, 5, [[0, 0, 0], [255, 255, 255]], 0), 5, 5, 1);
    const idx = new Uint8Array(25).map((_, i) => i % 2);
    anim.add(idx, 10);
    const g = decodeGif(anim.finish());
    expect(g.frames[0].minCode).toBe(2);
    expect(Buffer.from(g.frames[0].canvas).equals(Buffer.from(idx))).toBe(true);
  });

  it("encodes the loop count as NETSCAPE repeats (0 = forever, N plays = N - 1)", () => {
    for (const [plays, stored] of [
      [0, 0],
      [2, 1],
      [20, 19],
    ]) {
      const anim = new GifAnimator(new GifWriter(2, 2, [...palette, [0, 0, 0]], plays), 2, 2, 200);
      anim.add(new Uint8Array(4), 10);
      expect(decodeGif(anim.finish()).loop).toBe(stored);
    }
  });

  it("splits delays beyond the 16-bit maximum without losing time", () => {
    const anim = new GifAnimator(new GifWriter(4, 4, [...palette, [0, 0, 0]], 0), 4, 4, 200);
    anim.add(new Uint8Array(16).fill(7), 70000);
    const g = decodeGif(anim.finish());
    expect(g.frames.map((f) => f.delay)).toEqual([65535, 70000 - 65535]);
    // the extra frame is a transparent 1×1 patch: the picture does not change
    expect(Buffer.from(g.frames[1].canvas).equals(Buffer.from(g.frames[0].canvas))).toBe(true);
  });

  it("round-trips data that fills the LZW dictionary many times", () => {
    const w = 512;
    const h = 512;
    const anim = new GifAnimator(new GifWriter(w, h, [...palette, [0, 0, 0]], 0), w, h, 200);
    let seed = 7;
    const idx = new Uint8Array(w * h).map(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) >>> 24) % 200);
    anim.add(idx, 5);
    const g = decodeGif(anim.finish());
    expect(Buffer.from(g.frames[0].canvas).equals(Buffer.from(idx))).toBe(true);
  });
});
