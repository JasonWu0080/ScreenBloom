/**
 * Frame timing. Output time `t` inside the clip maps to source time `start + t * speed`.
 * Holds extend the first / last frame. All functions are pure so they can be unit-tested
 * and shared between the UI (durations shown to the user) and the worker (actual frames).
 */

export interface TimingInput {
  start: number;
  end: number;
  speed: number;
  fps: number;
  holdStart: number;
  holdEnd: number;
}

/** Duration of the clip part of the output (without holds), seconds. */
export function clipOutputDuration(t: Pick<TimingInput, "start" | "end" | "speed">): number {
  return Math.max(0, t.end - t.start) / t.speed;
}

export function totalOutputDuration(t: TimingInput): number {
  return t.holdStart + clipOutputDuration(t) + t.holdEnd;
}

export interface GifFrame {
  /** Source timestamp to sample, seconds. */
  sourceTime: number;
  /** Display time in hundredths of a second (GIF's native unit). */
  delayCs: number;
}

/**
 * Frames for a GIF. The clip is sampled at `fps`; the last frame absorbs the remainder so
 * the total equals the requested duration. Delays are derived from rounded cumulative
 * boundaries, so rounding errors never accumulate (e.g. 15 fps → 7,7,6,7,7,6… cs).
 */
export function planGifFrames(t: TimingInput): GifFrame[] {
  const clip = clipOutputDuration(t);
  const n = Math.max(1, Math.round(clip * t.fps));
  const frames: GifFrame[] = [];
  let prevCs = 0;
  for (let i = 0; i < n; i++) {
    const clipEnd = i === n - 1 ? clip : (i + 1) / t.fps;
    let endSec = t.holdStart + clipEnd;
    if (i === n - 1) endSec += t.holdEnd;
    const endCs = Math.round(endSec * 100);
    frames.push({ sourceTime: t.start + (i / t.fps) * t.speed, delayCs: endCs - prevCs });
    prevCs = endCs;
  }
  // Browsers treat delays below 2cs as 10cs, which would slow playback down. Fold such
  // frames into their predecessor (only possible for a tiny trailing remainder).
  for (let i = frames.length - 1; i > 0; i--) {
    if (frames[i].delayCs < 2) {
      frames[i - 1].delayCs += frames[i].delayCs;
      frames.splice(i, 1);
    }
  }
  if (frames[0].delayCs < 2) frames[0].delayCs = 2;
  return frames;
}

export interface VideoFrameSlot {
  sourceTime: number;
  /** Presentation timestamp in the output, seconds. */
  timestamp: number;
  duration: number;
}

/**
 * Constant-frame-rate frames for MP4 covering holds + clip. Holds repeat the first / last
 * clip frame (CFR is the most compatible choice for players and editors). The last frame
 * is shortened or lengthened slightly so the file duration matches exactly.
 */
export function planVideoFrames(t: TimingInput): VideoFrameSlot[] {
  const clip = clipOutputDuration(t);
  const total = totalOutputDuration(t);
  const m = Math.max(1, Math.round(total * t.fps));
  const lastClipTime = t.start + Math.max(0, Math.round(clip * t.fps) - 1) * (t.speed / t.fps);
  const slots: VideoFrameSlot[] = [];
  for (let k = 0; k < m; k++) {
    const timestamp = k / t.fps;
    const c = timestamp - t.holdStart;
    let sourceTime: number;
    if (c < 0) sourceTime = t.start;
    else if (c >= clip) sourceTime = lastClipTime;
    else sourceTime = Math.min(t.start + c * t.speed, lastClipTime);
    const duration = k === m - 1 ? total - timestamp : 1 / t.fps;
    slots.push({ sourceTime, timestamp, duration });
  }
  return slots;
}
