/**
 * Minimal GIF89a writer: global palette, NETSCAPE loop block, per-frame sub-rectangles,
 * transparency and exact centisecond delays. Only what this tool needs.
 */

export class ByteWriter {
  private chunks: Uint8Array[] = [];
  private buf = new Uint8Array(1 << 16);
  private pos = 0;
  private flushed = 0;

  byte(b: number) {
    if (this.pos === this.buf.length) this.grow();
    this.buf[this.pos++] = b;
  }
  u16(v: number) {
    this.byte(v & 0xff);
    this.byte((v >> 8) & 0xff);
  }
  bytes(arr: ArrayLike<number>, start = 0, end = arr.length) {
    for (let i = start; i < end; i++) this.byte(arr[i]);
  }
  ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  get length() {
    return this.flushed + this.pos;
  }
  private grow() {
    this.chunks.push(this.buf);
    this.flushed += this.buf.length;
    this.buf = new Uint8Array(1 << 20);
    this.pos = 0;
  }
  /** Concatenates all chunks into one tightly sized buffer. */
  finish(): Uint8Array {
    const out = new Uint8Array(this.length);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    out.set(this.buf.subarray(0, this.pos), off);
    this.chunks = [];
    return out;
  }
}

/** Number of bits needed for a color table holding `n` entries (GIF minimum is 2 entries). */
export function tableBits(n: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
}

export interface GifFrameRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Palette indices, row-major, width*height. */
  indices: Uint8Array;
  delayCs: number;
  transparentIndex: number | null;
}

export class GifWriter {
  readonly out = new ByteWriter();
  private readonly minCodeSize: number;
  private readonly lzw: LzwEncoder;

  /**
   * @param loop 0 = forever, N >= 1 = play N times in total. "Play once" writes no NETSCAPE
   *   block; otherwise the stored repeat count is N - 1 (it counts repeats after the first play).
   */
  constructor(width: number, height: number, palette: number[][], loop: number) {
    const bits = tableBits(palette.length);
    this.minCodeSize = Math.max(2, bits);
    this.lzw = new LzwEncoder();
    const o = this.out;
    o.ascii("GIF89a");
    o.u16(width);
    o.u16(height);
    o.byte(0x80 | ((bits - 1) << 4) | (bits - 1)); // global table, color resolution, size
    o.byte(0); // background index
    o.byte(0); // pixel aspect ratio
    for (let i = 0; i < 1 << bits; i++) {
      const c = palette[i] ?? [0, 0, 0];
      o.byte(c[0]);
      o.byte(c[1]);
      o.byte(c[2]);
    }
    if (loop !== 1) {
      o.byte(0x21);
      o.byte(0xff);
      o.byte(11);
      o.ascii("NETSCAPE2.0");
      o.byte(3);
      o.byte(1);
      o.u16(loop === 0 ? 0 : loop - 1);
      o.byte(0);
    }
  }

  frame(f: GifFrameRegion) {
    const o = this.out;
    // Graphic Control Extension. Disposal 1 = keep this frame for the next one to draw over.
    o.byte(0x21);
    o.byte(0xf9);
    o.byte(4);
    o.byte((1 << 2) | (f.transparentIndex != null ? 1 : 0));
    o.u16(Math.min(65535, Math.max(0, f.delayCs)));
    o.byte(f.transparentIndex ?? 0);
    o.byte(0);
    // Image Descriptor, no local table, not interlaced.
    o.byte(0x2c);
    o.u16(f.x);
    o.u16(f.y);
    o.u16(f.width);
    o.u16(f.height);
    o.byte(0);
    this.lzw.encode(o, f.indices, this.minCodeSize);
  }

  finish(): Uint8Array {
    this.out.byte(0x3b);
    return this.out.finish();
  }
}

/**
 * Variable-length-code LZW as specified by GIF89a. The dictionary is a flat table keyed
 * by (prefix code << 8 | next index); generation stamps make table resets O(1).
 */
export class LzwEncoder {
  private codes = new Uint16Array(4096 * 256);
  private gens = new Uint32Array(4096 * 256);
  private gen = 0;
  private block = new Uint8Array(255);

  encode(o: ByteWriter, indices: Uint8Array, minCodeSize: number) {
    o.byte(minCodeSize);
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    let gen = ++this.gen;
    const codes = this.codes;
    const gens = this.gens;
    const block = this.block;
    let blockLen = 0;
    let acc = 0;
    let accBits = 0;

    const emit = (code: number) => {
      acc |= code << accBits;
      accBits += codeSize;
      while (accBits >= 8) {
        block[blockLen++] = acc & 0xff;
        if (blockLen === 255) {
          o.byte(255);
          o.bytes(block, 0, 255);
          blockLen = 0;
        }
        acc >>>= 8;
        accBits -= 8;
      }
    };

    emit(clearCode);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      if (gens[key] === gen) {
        prefix = codes[key];
        continue;
      }
      emit(prefix);
      if (nextCode === 4096) {
        emit(clearCode);
        codeSize = minCodeSize + 1;
        nextCode = eoiCode + 1;
        gen = ++this.gen;
      } else {
        if (nextCode >= 1 << codeSize) codeSize++;
        codes[key] = nextCode++;
        gens[key] = gen;
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoiCode);
    if (accBits > 0) {
      block[blockLen++] = acc & 0xff;
      if (blockLen === 255) {
        o.byte(255);
        o.bytes(block, 0, 255);
        blockLen = 0;
      }
    }
    if (blockLen > 0) {
      o.byte(blockLen);
      o.bytes(block, 0, blockLen);
    }
    o.byte(0); // block terminator
    // Avoid Uint32 wrap-around in pathological sessions.
    if (this.gen > 0xfffffff0) {
      this.gens.fill(0);
      this.gen = 0;
    }
  }
}
