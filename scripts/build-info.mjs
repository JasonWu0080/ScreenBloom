// Build identity: app version, Git commit and build time. Computed once per `npm run build`
// ("prebuild" writes build-info.json), compiled into the bundle by next.config.ts and copied
// to out/version.json by the postbuild step, so the page and the file always agree.
// Contains no environment variables or machine details — only what is safe to publish.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BUILD_INFO_FILE = path.join(root, "build-info.json");

function gitCommit() {
  // The checked-out commit (in CI too: GITHUB_SHA is the triggering ref, which differs from the
  // checkout for manually dispatched releases). A dirty tree is marked so it can't pass for a release.
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return process.env.GITHUB_SHA || "unknown";
  }
}

export function computeBuildInfo() {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  // SOURCE_DATE_EPOCH (seconds) allows reproducible builds.
  const epoch = Number(process.env.SOURCE_DATE_EPOCH);
  const buildTime = (Number.isFinite(epoch) && epoch > 0 ? new Date(epoch * 1000) : new Date()).toISOString();
  return { name: "ScreenBloom", version: pkg.version, commit: gitCommit(), buildTime };
}

/** The info written by this build's "prebuild" step, or freshly computed (dev server, direct `next build`). */
export function readBuildInfo() {
  if (process.env.npm_lifecycle_event === "build" && existsSync(BUILD_INFO_FILE)) return JSON.parse(readFileSync(BUILD_INFO_FILE, "utf8"));
  return computeBuildInfo();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const info = computeBuildInfo();
  writeFileSync(BUILD_INFO_FILE, JSON.stringify(info, null, 2) + "\n");
  console.log(`build info: ${info.name} v${info.version} ${info.commit.slice(0, 12)} ${info.buildTime}`);
}
