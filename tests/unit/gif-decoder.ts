// Independent GIF89a parser + LZW decoder, written from the spec and shared by the GIF tests.
// It deliberately shares no code with src/lib/encode/gif so it can catch encoder bugs.

/** Independent, minimal GIF decoder used to verify the encoder output. */
export function decodeGif(bytes: Uint8Array) {
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => bytes[p++] | (bytes[p++] << 8);
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  p = 6;
  const width = u16();
  const height = u16();
  const flags = u8();
  p += 2;
  const gctSize = flags & 0x80 ? 1 << ((flags & 7) + 1) : 0;
  const palette = bytes.subarray(p, p + gctSize * 3);
  p += gctSize * 3;
  let loop: number | null = null;
  const frames: { x: number; y: number; w: number; h: number; imgFlags: number; minCode: number; delay: number; transparent: number | null; dispose: number; canvas: Uint8Array }[] = [];
  const canvas = new Uint8Array(width * height);
  let gce = { delay: 0, transparent: null as number | null, dispose: 0 };
  for (;;) {
    const b = u8();
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = u8();
      if (label === 0xf9) {
        u8();
        const f = u8();
        const delay = u16();
        const ti = u8();
        u8();
        gce = { delay, transparent: f & 1 ? ti : null, dispose: (f >> 2) & 7 };
      } else if (label === 0xff) {
        const n = u8();
        const app = String.fromCharCode(...bytes.subarray(p, p + n));
        p += n;
        for (let len = u8(); len; len = u8()) {
          if (app === "NETSCAPE2.0" && bytes[p] === 1) loop = bytes[p + 1] | (bytes[p + 2] << 8);
          p += len;
        }
      } else {
        for (let len = u8(); len; len = u8()) p += len;
      }
    } else if (b === 0x2c) {
      const x = u16();
      const y = u16();
      const w = u16();
      const h = u16();
      const imgFlags = u8();
      const minCode = u8();
      const data: number[] = [];
      for (let len = u8(); len; len = u8()) {
        for (let i = 0; i < len; i++) data.push(u8());
      }
      const idx = lzwDecode(data, minCode, w * h);
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          const v = idx[yy * w + xx];
          if (gce.transparent !== null && v === gce.transparent) continue;
          canvas[(y + yy) * width + x + xx] = v;
        }
      frames.push({ x, y, w, h, imgFlags, minCode, ...gce, canvas: canvas.slice() });
    } else throw new Error("bad block " + b);
  }
  return { sig, width, height, flags, palette, loop, frames };
}

export function lzwDecode(data: number[], minCode: number, count: number): Uint8Array {
  const out = new Uint8Array(count);
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let size = minCode + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clear; i++) dict[i] = [i];
    dict[clear] = [];
    dict[eoi] = [];
    size = minCode + 1;
  };
  reset();
  let bitPos = 0;
  const read = () => {
    let v = 0;
    for (let i = 0; i < size; i++, bitPos++) v |= ((data[bitPos >> 3] >> (bitPos & 7)) & 1) << i;
    return v;
  };
  let o = 0;
  let prev: number[] | null = null;
  while (bitPos + size <= data.length * 8) {
    const code = read();
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new Error("bad code");
    for (const v of entry) out[o++] = v;
    if (prev) {
      dict.push([...prev, entry[0]]);
      if (dict.length === 1 << size && size < 12) size++;
    }
    prev = entry;
  }
  if (o !== count) throw new Error(`decoded ${o} of ${count}`);
  return out;
}
