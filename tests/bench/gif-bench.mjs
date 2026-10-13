// GIF export benchmark through the real UI in Google Chrome, against the production build.
//
//   Input:  1920×1080, 10 s, 30 fps H.264 (samples/bench-1080p30-10s.mp4, synthetic screen recording)
//   Output: GIF, 800 px wide, 15 fps, Balanced colors (256, no dithering)
//
//   npm run build && npm run bench
//   BENCH_RUNS=7 BENCH_BASELINE=path/to/previous.json BENCH_MAX_REGRESSION=0.25 npm run bench
//
// Reports the median of several runs after a warm-up. Timings come from the worker
// (ExportStats); wall time is click → result shown. Results are only comparable on the same
// machine and browser, so there is no fixed time limit: pass a baseline from the same
// environment to fail on a relative regression instead.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../../scripts/serve-out.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sample = path.join(root, "samples", "bench-1080p30-10s.mp4");
const outDir = path.join(root, "test-results", "bench");
mkdirSync(outDir, { recursive: true });
const RUNS = Number(process.env.BENCH_RUNS ?? 5);
const WARMUP = Number(process.env.BENCH_WARMUP ?? 1);
const MAX_REGRESSION = Number(process.env.BENCH_MAX_REGRESSION ?? 0.25);

if (!existsSync(sample)) {
  const src = path.join(root, "samples", "landscape-1920.mp4");
  if (!existsSync(src)) throw new Error("Run `npm run samples` first (needs samples/landscape-1920.mp4).");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-stream_loop", "1", "-i", src, "-t", "10", "-r", "30",
    "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-an", sample]);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const PORT = 4329;
const BASE = `http://127.0.0.1:${PORT}/`;
const server = await serve(PORT);
const browser = await chromium.launch({ channel: "chrome" });
const runs = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("lang", "en"));
  for (let i = 0; i < WARMUP + RUNS; i++) {
    // A fresh page per run: same starting state, no results kept from the previous run.
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.setInputFiles('[data-testid="file-input"]', sample);
    const info = await (await page.waitForSelector('[data-testid="source-info"]', { timeout: 30000 })).textContent();
    if (i === 0 && !/1920 × 1080/.test(info)) throw new Error(`unexpected sample: ${info}`);
    await page.getByRole("radio", { name: "Balanced" }).click();
    await page.fill("#out-width", "800");
    await page.press("#out-width", "Enter");
    await page.selectOption("#out-fps", "15");
    const t0 = Date.now();
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    await page.waitForSelector('img[data-testid="result-preview"]', { timeout: 300000 });
    const wall = Date.now() - t0;
    const r = await page.evaluate(async () => {
      const el = document.querySelector('[data-testid="result-info"]');
      const img = document.querySelector('[data-testid="result-preview"]');
      return { stats: JSON.parse(el.dataset.stats), bytes: (await (await fetch(img.src)).blob()).size, size: [img.naturalWidth, img.naturalHeight], text: el.textContent };
    });
    const frames = Number(/Frames(\d+)/.exec(r.text)?.[1] ?? 0);
    const run = { wall, ...r.stats, bytes: r.bytes, size: r.size, framesWritten: frames };
    if (i >= WARMUP) runs.push(run);
    console.log(`${i < WARMUP ? "warm-up" : `run ${i - WARMUP + 1}`}: total ${r.stats.total.toFixed(0)} ms (palette ${r.stats.palette.toFixed(0)}, decode wait ${r.stats.decode.toFixed(0)}, process ${r.stats.process.toFixed(0)}, encode ${r.stats.encode.toFixed(0)}), wall ${wall} ms, ${(r.bytes / 1024).toFixed(0)} KB`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

const planned = 150; // 10 s × 15 fps
const m = (k) => median(runs.map((r) => r[k]));
const summary = {
  date: new Date().toISOString(),
  environment: {
    browser: `Chrome ${browser.version()}`,
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    memoryGB: Math.round(os.totalmem() / 1024 ** 3),
    node: process.version,
    app: JSON.parse(readFileSync(path.join(root, "out", "version.json"), "utf8")),
  },
  input: "1920×1080, 10 s, 30 fps H.264 (synthetic screen recording)",
  output: "GIF 800 px wide, 15 fps, Balanced (256 colors, no dithering)",
  runs: runs.length,
  median: {
    totalMs: m("total"),
    wallMs: m("wall"),
    paletteMs: m("palette"),
    decodeWaitMs: m("decode"),
    processMs: m("process"),
    encodeMs: m("encode"),
    bytes: m("bytes"),
    effectiveFps: planned / (m("total") / 1000),
  },
  outputSize: runs[0]?.size,
  framesPlanned: planned,
  framesWritten: runs[0]?.framesWritten,
  peakMemory: "N/A (not reliably measurable for a worker from the page without cross-origin isolation)",
  raw: runs,
};
const file = path.join(outDir, "gif-bench.json");
writeFileSync(file, JSON.stringify(summary, null, 2));
console.table(summary.median);
console.log(`Saved ${path.relative(root, file)}`);

const baselinePath = process.env.BENCH_BASELINE;
if (baselinePath) {
  const base = JSON.parse(readFileSync(baselinePath, "utf8")).median;
  const slower = summary.median.totalMs / base.totalMs - 1;
  const bigger = summary.median.bytes / base.bytes - 1;
  console.log(`vs baseline: total ${(slower * 100).toFixed(1)} %, size ${(bigger * 100).toFixed(1)} % (limit +${(MAX_REGRESSION * 100).toFixed(0)} %)`);
  if (slower > MAX_REGRESSION || bigger > MAX_REGRESSION) {
    console.error("Performance regression beyond the configured threshold.");
    process.exit(1);
  }
}
