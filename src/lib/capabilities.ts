/**
 * Browser APIs that video processing actually uses, directly or through Mediabunny: a module
 * worker to run in, WebCodecs decoding (chunks in, frames out) and a 2D OffscreenCanvas for
 * crop / scale / pixel reads. H.264 *encoding* is optional (MP4 only) and is checked separately
 * with the real encoder configuration, because `VideoEncoder` existing doesn't mean H.264 works.
 */
export const PAGE_APIS = ["Worker", "VideoDecoder", "EncodedVideoChunk", "VideoFrame", "OffscreenCanvas"] as const;
/** Inside the worker, `Worker` itself is not needed. */
export const WORKER_APIS = PAGE_APIS.filter((n) => n !== "Worker");

/** Names of required APIs that are missing from `scope` (empty = everything is there). */
export function missingApis(scope: object = globalThis, names: readonly string[] = PAGE_APIS): string[] {
  const g = scope as Record<string, unknown>;
  const missing = names.filter((n) => typeof g[n] === "undefined");
  if (names.includes("OffscreenCanvas") && !missing.includes("OffscreenCanvas")) {
    // Some engines shipped OffscreenCanvas before its 2D context.
    let ok = false;
    try {
      ok = new (g.OffscreenCanvas as typeof OffscreenCanvas)(1, 1).getContext("2d") != null;
    } catch {
      ok = false;
    }
    if (!ok) missing.push("OffscreenCanvas 2D");
  }
  return missing;
}
