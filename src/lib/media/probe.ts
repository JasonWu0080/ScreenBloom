import { ALL_FORMATS, BlobSource, CanvasSink, Input, canEncodeVideo } from "mediabunny";
import { LIMITS } from "@/lib/config";
import type { SourceInfo } from "@/lib/edit/types";
import type { Capabilities } from "@/lib/jobs/protocol";
import { JobError } from "./errors";

export function openInput(file: File) {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

/**
 * Reads metadata AND decodes the first frame. Support is decided by what the browser can
 * actually demux and decode, never by the file extension.
 */
export async function probeFile(file: File): Promise<SourceInfo> {
  if (file.size === 0) throw new JobError("empty", "file is empty");
  if (file.size > LIMITS.maxFileBytes) throw new JobError("source_too_large", `size ${file.size}`);
  const input = openInput(file);
  try {
    if (!(await input.canRead())) throw new JobError("unreadable", "unknown container");
    const format = await input.getFormat();
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new JobError("no_video");
    const codec = (await track.getCodec()) ?? "unknown";
    if (!(await track.canDecode())) throw new JobError("unsupported_codec", codec);

    const [width, height, codedWidth, codedHeight, rotation] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.getCodedWidth(),
      track.getCodedHeight(),
      track.getRotation(),
    ]);
    if (!(width > 0 && height > 0)) throw new JobError("unreadable", "invalid frame size");
    if (Math.max(width, height) > LIMITS.maxSourceLongSide) throw new JobError("source_too_large", `${width}x${height}`);

    const firstTimestamp = Math.max(0, await track.getFirstTimestamp());
    const duration = await track.computeDuration();
    if (!Number.isFinite(duration) || duration - firstTimestamp <= 0.001) throw new JobError("empty", `duration ${duration}`);

    const stats = await track.computePacketStats(240);
    const hasAudio = (await input.getAudioTracks()).length > 0;

    // Prove we can decode: render the first frame at a tiny size.
    const sink = new CanvasSink(track, { width: 64, height: 64, fit: "contain" });
    const first = await sink.getCanvas(firstTimestamp);
    if (!first) throw new JobError("empty", "no decodable frame");

    return {
      fileName: file.name,
      fileSize: file.size,
      container: format.name,
      codec,
      duration,
      firstTimestamp,
      width,
      height,
      codedWidth,
      codedHeight,
      rotation,
      averageFps: stats.packetCount > 1 ? stats.averagePacketRate : 0,
      hasAudio,
    };
  } finally {
    input.dispose();
  }
}

export async function detectCapabilities(): Promise<Capabilities> {
  let mp4 = false;
  try {
    mp4 = typeof VideoEncoder !== "undefined" && (await canEncodeVideo("avc", { width: 1280, height: 720 }));
  } catch {
    mp4 = false;
  }
  return { mp4 };
}
