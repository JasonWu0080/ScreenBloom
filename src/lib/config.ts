/**
 * Local-processing limits. Everything runs in the visitor's browser, so these protect
 * the tab from running out of memory or appearing frozen. Values were chosen from
 * measurements in desktop Chrome (see README "Verified limits"); adjust here only.
 */
export const LIMITS = {
  /** Source files are read lazily (never fully loaded into memory), so this can be generous. */
  maxFileBytes: 2 * 1024 ** 3,
  /** Longest side of the decoded source frame. 5K (5120×2880) screen captures are allowed. */
  maxSourceLongSide: 5120,
  /** Output duration (including speed change and holds) per format, in seconds. */
  maxOutputSeconds: { gif: 60, mp4: 300 } as const,
  /** GIF frames are encoded one by one; this caps encode time and file size. */
  maxGifFrames: 1500,
  /** Output width / longest output side per format, in pixels. */
  maxOutputWidth: { gif: 1600, mp4: 1920 } as const,
  maxOutputLongSide: { gif: 1600, mp4: 1920 } as const,
  minOutputSide: 32,
  /** Smallest crop the user can make, in source pixels. */
  minCropSize: 16,
  /** Shortest selectable clip, in seconds. */
  minClipSeconds: 0.1,
  fps: { min: 1, max: 30 },
  speed: { min: 0.25, max: 4 },
  hold: { min: 0, max: 10 },
  gifLoopMaxPlays: 20,
  /** GIF larger than this shows a hint to shorten / shrink / try MP4. */
  largeGifBytes: 8 * 1024 ** 2,
} as const;
