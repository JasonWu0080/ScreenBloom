import type { NextConfig } from "next";
import { readBuildInfo } from "./scripts/build-info.mjs";

const build = readBuildInfo();

// Static export: the app is plain HTML/JS/CSS and can be served by any static host.
// No COOP/COEP headers are needed because no SharedArrayBuffer / multi-threaded WASM is used.
const nextConfig: NextConfig = {
  output: "export",
  // Optional sub-path deployment, e.g. `BASE_PATH=/tools/gif npm run build`. Build-time only.
  basePath: process.env.BASE_PATH || undefined,
  // Compiled into the bundle. Only public facts: version, commit and build time, plus the
  // public URL used for canonical / Open Graph links (self-hosters set SITE_URL at build time).
  env: {
    APP_VERSION: build.version,
    APP_COMMIT: build.commit,
    APP_BUILD_TIME: build.buildTime,
    SITE_URL: process.env.SITE_URL || "https://screenbloom.storyweave.cloud",
  },
  // Dev only: let the dev server page hydrate when opened via a private LAN address. Video
  // processing still needs a secure context (localhost or `next dev --experimental-https`).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
