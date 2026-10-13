import { BufferTarget, CanvasSink, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo, type InputVideoTrack } from "mediabunny";
import { computeOutputSize } from "@/lib/edit/output";
import { mp4Bitrate } from "@/lib/edit/params";
import { planGifFrames, planVideoFrames } from "@/lib/edit/timeline";
import type { EditParams } from "@/lib/edit/types";
import { GifAnimator } from "@/lib/encode/gif/animator";
import { PaletteMapper, buildPalette } from "@/lib/encode/gif/palette";
import { GifWriter } from "@/lib/encode/gif/writer";
import { JobError } from "@/lib/media/errors";
import { FrameScaler } from "@/lib/media/frames";
import { openInput } from "@/lib/media/probe";
import type { ExportResult, Stage } from "@/lib/jobs/protocol";

export type ProgressFn = (stage: Stage, done?: number, total?: number) => void;

/** Frames used to build the global GIF palette. */
const PALETTE_SAMPLES = 12;

/**
 * Yields one decoded frame per requested timestamp (sorted ascending). Timestamps before
 * the first frame are clamped; a missing frame reuses the previous one so a short glitch in
 * a variable-frame-rate file never shifts the timeline.
 */
async function* framesAt(track: InputVideoTrack, times: number[]) {
  const first = await track.getFirstTimestamp();
  const sink = new CanvasSink(track, { poolSize: 2 });
  let last: OffscreenCanvas | HTMLCanvasElement | null = null;
  for await (const wrapped of sink.canvasesAtTimestamps(times.map((t) => Math.max(first, t)))) {
    if (wrapped) last = wrapped.canvas;
    if (!last) throw new JobError("unreadable", "frame missing");
    yield last;
  }
}

export async function exportClip(file: File, params: EditParams, progress: ProgressFn): Promise<ExportResult> {
  progress("opening");
  const input = openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new JobError("no_video");
    if (!(await track.canDecode())) throw new JobError("unsupported_codec", (await track.getCodec()) ?? "unknown");
    return params.format === "gif" ? await exportGif(track, params, progress) : await exportMp4(track, params, progress);
  } finally {
    input.dispose();
  }
}

async function exportGif(track: InputVideoTrack, p: EditParams, progress: ProgressFn): Promise<ExportResult> {
  const { width, height, sourceRect } = computeOutputSize(p.crop, p.outputWidth, "gif");
  const frames = planGifFrames(p);
  const scaler = new FrameScaler(width, height, sourceRect, true);
  try {
    // Pass 1: sample frames spread across the clip to build one stable palette.
    const k = Math.min(PALETTE_SAMPLES, frames.length);
    const sampleTimes = Array.from({ length: k }, (_, i) => frames[Math.floor(((i + 0.5) * frames.length) / k)].sourceTime);
    const samples: Uint8ClampedArray[] = [];
    progress("analyzing", 0, k);
    for await (const canvas of framesAt(track, sampleTimes)) {
      scaler.draw(canvas);
      samples.push(scaler.pixels());
      progress("analyzing", samples.length, k);
    }
    // One slot is reserved for transparency (used for unchanged pixels).
    const palette = buildPalette(samples, Math.min(255, p.gifColors - 1));
    samples.length = 0;
    const transparentIndex = palette.length;
    const writer = new GifWriter(width, height, [...palette, [0, 0, 0]], p.gifLoop);
    const animator = new GifAnimator(writer, width, height, transparentIndex);
    const mapper = new PaletteMapper(palette, p.gifDither);
    const indices = new Uint8Array(width * height);

    // Pass 2: decode every output frame, map to the palette, write.
    let i = 0;
    progress("encoding", 0, frames.length);
    for await (const canvas of framesAt(track, frames.map((f) => f.sourceTime))) {
      scaler.draw(canvas);
      mapper.map(scaler.pixels(), width, height, indices);
      animator.add(indices, frames[i].delayCs);
      i++;
      progress("encoding", i, frames.length);
    }
    progress("finalizing");
    const bytes = animator.finish();
    const totalCs = frames.reduce((s, f) => s + f.delayCs, 0);
    return {
      format: "gif",
      mimeType: "image/gif",
      bytes: bytes.buffer as ArrayBuffer,
      width,
      height,
      duration: totalCs / 100,
      frames: animator.framesWritten,
    };
  } finally {
    scaler.dispose();
  }
}

async function exportMp4(track: InputVideoTrack, p: EditParams, progress: ProgressFn): Promise<ExportResult> {
  const { width, height, sourceRect } = computeOutputSize(p.crop, p.outputWidth, "mp4");
  const bitrate = mp4Bitrate(width, height, p.fps, p.mp4Quality);
  const supported = typeof VideoEncoder !== "undefined" && (await canEncodeVideo("avc", { width, height, bitrate, frameRate: p.fps }));
  if (!supported) throw new JobError("mp4_unsupported", `avc ${width}x${height}`);

  const slots = planVideoFrames(p);
  const scaler = new FrameScaler(width, height, sourceRect, false);
  const format = new Mp4OutputFormat({ fastStart: "in-memory" });
  const target = new BufferTarget();
  const output = new Output({ format, target });
  try {
    // No audio track is ever added: the file is silent by construction, not muted.
    const source = new CanvasSource(scaler.canvas, {
      codec: "avc",
      quality: new Quality({ bitrate }),
      keyFrameInterval: 2,
    });
    output.addVideoTrack(source, { frameRate: p.fps });
    await output.start();
    let i = 0;
    progress("encoding", 0, slots.length);
    for await (const canvas of framesAt(track, slots.map((s) => s.sourceTime))) {
      scaler.draw(canvas);
      await source.add(slots[i].timestamp, slots[i].duration);
      i++;
      progress("encoding", i, slots.length);
    }
    progress("finalizing");
    await output.finalize();
    if (!target.buffer) throw new JobError("failed", "empty output");
    const last = slots[slots.length - 1];
    return {
      format: "mp4",
      mimeType: format.mimeType,
      bytes: target.buffer,
      width,
      height,
      duration: last.timestamp + last.duration,
      frames: slots.length,
    };
  } catch (e) {
    if (output.state === "started") await output.cancel().catch(() => {});
    throw e;
  } finally {
    scaler.dispose();
  }
}
