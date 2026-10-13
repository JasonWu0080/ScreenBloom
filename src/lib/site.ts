/**
 * Public identity of the app. Values marked "build" are injected at build time by
 * next.config.ts (see scripts/build-info.mjs); none of them is secret.
 */
export const SITE = {
  name: "ScreenBloom",
  /** Public URL of the app root (build: SITE_URL), used for canonical and Open Graph links. */
  url: (process.env.SITE_URL || "https://screenbloom.storyweave.cloud").replace(/\/+$/, ""),
  repo: "https://github.com/JasonWu0080/ScreenBloom",
  title: "ScreenBloom — Free Online Video to GIF Converter",
  description:
    "Convert videos and screen recordings into optimized GIFs online. Trim, crop, adjust FPS, and export directly in your browser. Free and private.",
} as const;

export const BUILD = {
  version: process.env.APP_VERSION || "0.0.0",
  commit: process.env.APP_COMMIT || "unknown",
  time: process.env.APP_BUILD_TIME || "",
} as const;

/** "a1b2c3d" (or "a1b2c3d-dirty") for display; full SHA stays in version.json. */
export function shortCommit(commit: string): string {
  return /^[0-9a-f]{40}/.test(commit) ? commit.slice(0, 7) + commit.slice(40) : commit;
}
