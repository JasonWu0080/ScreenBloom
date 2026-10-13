// Helpers shared by the end-to-end scripts. Output files are always checked as files, by
// parsers that do not share code with the encoders.
import { ALL_FORMATS, FilePathSource, Input } from "mediabunny";
import { readFileSync } from "node:fs";

/** Parses GIF blocks: logical size, loop count, frame delays. */
export function inspectGif(file) {
  const b = readFileSync(file);
  if (b.toString("ascii", 0, 6) !== "GIF89a") throw new Error("not a GIF89a file");
  let p = 13;
  const w = b.readUInt16LE(6);
  const h = b.readUInt16LE(8);
  if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1));
  let loop = null;
  const delays = [];
  let pendingDelay = 0;
  for (;;) {
    const t = b[p++];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b[p++];
      if (label === 0xf9) pendingDelay = b.readUInt16LE(p + 2);
      if (label === 0xff && b.toString("ascii", p + 1, p + 12) === "NETSCAPE2.0") loop = b.readUInt16LE(p + 14);
      for (let len = b[p++]; len; len = b[p++]) p += len;
    } else if (t === 0x2c) {
      const flags = b[p + 8];
      p += 9;
      if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
      p++; // min code size
      for (let len = b[p++]; len; len = b[p++]) p += len;
      delays.push(pendingDelay);
    } else throw new Error("bad GIF block");
  }
  return { w, h, loop, delays, totalCs: delays.reduce((s, d) => s + d, 0) };
}

/**
 * Decodes every frame of the GIF shown in the result preview with Chrome's own ImageDecoder.
 * ImageDecoder returns fully composited frames, so a disposal or transparency bug shows up as
 * transparent pixels in later frames (the first frame is always opaque).
 */
export async function decodeGifInBrowser(page) {
  return page.evaluate(async () => {
    const img = document.querySelector('[data-testid="result-preview"]');
    const data = await (await fetch(img.src)).arrayBuffer();
    const dec = new ImageDecoder({ data, type: "image/gif" });
    await dec.tracks.ready;
    await dec.completed;
    const tr = dec.tracks.selectedTrack;
    let durationUs = 0;
    let transparentPixelsInLast = -1;
    let size = [0, 0];
    for (let i = 0; i < tr.frameCount; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      durationUs += image.duration ?? 0;
      size = [image.displayWidth, image.displayHeight];
      if (i === tr.frameCount - 1) {
        const c = new OffscreenCanvas(image.displayWidth, image.displayHeight);
        const ctx = c.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const px = ctx.getImageData(0, 0, c.width, c.height).data;
        transparentPixelsInLast = 0;
        for (let j = 3; j < px.length; j += 4) if (px[j] !== 255) transparentPixelsInLast++;
      }
      image.close();
    }
    const out = { frames: tr.frameCount, repetition: tr.repetitionCount, size, durationMs: durationUs / 1000, transparentPixelsInLast, natural: [img.naturalWidth, img.naturalHeight] };
    dec.close();
    return out;
  });
}

/** Container-level facts about an exported MP4, read with Mediabunny (no ffprobe needed). */
export async function inspectMp4(file) {
  const input = new Input({ source: new FilePathSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getAudioTracks();
    return {
      container: (await input.getFormat()).name,
      codec: video ? await video.getCodec() : null,
      width: video ? await video.getDisplayWidth() : 0,
      height: video ? await video.getDisplayHeight() : 0,
      duration: video ? (await video.computeDuration()) - Math.max(0, await video.getFirstTimestamp()) : 0,
      audioTracks: audio.length,
    };
  } finally {
    input.dispose();
  }
}

/** Same rounding as src/lib/format.ts formatBytes, for comparing with the UI. */
export function fmtBytes(n) {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 ** 2).toFixed(n < 100 * 1024 ** 2 ? 2 : 1)} MB`;
}

/** Records failures to the console and keeps a summary. */
export function reporter() {
  const results = [];
  const skipped = [];
  return {
    results,
    skipped,
    check(name, ok, info = "") {
      results.push({ name, ok: !!ok, info });
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`);
    },
    skip(name, why) {
      skipped.push(name);
      console.log(`SKIP  ${name}  — ${why}`);
    },
    get failures() {
      return results.filter((r) => !r.ok).length;
    },
  };
}
