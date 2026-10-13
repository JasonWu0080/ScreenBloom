// Critical-path smoke test that can run against any deployment, including production.
// Drives the real UI in Google Chrome with the synthetic samples from `npm run samples`
// (no private recordings) and checks the downloaded files, worker lifecycle and memory.
//
//   npm run build && npm run e2e:smoke                                   # local out/
//   E2E_BASE_URL=https://screenbloom.storyweave.cloud npm run e2e:smoke  # a deployment
//
// All processing happens in the browser, so running this against a live site only costs the
// server a handful of static file requests.
import { chromium } from "playwright";
import { mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../../scripts/serve-out.mjs";
import { decodeGifInBrowser, fmtBytes, inspectGif, inspectMp4, reporter } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const samples = path.join(root, "samples");
const remote = process.env.E2E_BASE_URL;
const BASE = remote ? remote.replace(/\/?$/, "/") : "http://127.0.0.1:4325/";
const outDir = path.join(root, "test-results", remote ? "smoke-remote" : "smoke");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const r = reporter();
const { check } = r;
const server = remote ? null : await serve(4325);
const browser = await chromium.launch({ channel: "chrome" });
console.log(`Target: ${BASE}  Browser: Chrome ${browser.version()}`);

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => localStorage.setItem("lang", "en"));
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()));
const origin = new URL(BASE).origin;
const foreign = [];
const badResponses = [];
ctx.on("request", (req) => {
  const u = new URL(req.url());
  if (u.protocol === "blob:" || u.protocol === "data:") return;
  if (u.origin !== origin || req.method() !== "GET") foreign.push(`${req.method()} ${req.url()}`);
});
ctx.on("response", (res) => res.status() >= 400 && badResponses.push(`${res.status()} ${res.url()}`));

async function setInput(selector, value) {
  await page.fill(selector, String(value));
  await page.press(selector, "Enter");
}
async function waitNoWorkers(ms = 3000) {
  const t0 = Date.now();
  while (page.workers().length && Date.now() - t0 < ms) await page.waitForTimeout(50);
  return page.workers().length;
}
async function heapMB() {
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  return usedSize / 1024 ** 2;
}
async function exportGif(name) {
  await page.getByRole("button", { name: "Export GIF", exact: true }).click();
  await page.waitForSelector('img[data-testid="result-preview"]', { timeout: 180000 });
  const info = await page.textContent('[data-testid="result-info"]');
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-testid="download"]')]);
  const file = path.join(outDir, name);
  await dl.saveAs(file);
  return { file, info, suggested: dl.suggestedFilename() };
}

try {
  // 1. Page load, HTTPS, static assets.
  const resp = await page.goto(BASE, { waitUntil: "networkidle" });
  check("Home page responds 200", resp.status() === 200, String(resp.status()));
  if (remote) check("Served over HTTPS", BASE.startsWith("https://"));
  const csp = resp.headers()["content-security-policy"] ?? "";
  check("CSP restricts connections to the app's own origin", /connect-src 'self'/.test(csp), csp ? "present" : "missing");
  const title = await page.title();
  check("Document title names the product", /ScreenBloom/.test(title), title);
  check("Choose-file button is enabled (capabilities OK)", await page.getByRole("button", { name: "Choose file" }).isEnabled());
  check("No capability warning on the home page", (await page.locator('main [role="alert"]').count()) === 0);
  const head = await page.evaluate(() => ({
    description: document.querySelector('meta[name="description"]')?.content ?? "",
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? "",
    ogImage: document.querySelector('meta[property="og:image"]')?.content ?? "",
    twitter: document.querySelector('meta[name="twitter:card"]')?.content ?? "",
    jsonLd: document.querySelector('script[type="application/ld+json"]')?.textContent ?? "",
    version: document.querySelector('[data-testid="app-version"]')?.textContent ?? "",
  }));
  check("Meta description present", head.description.length > 50, head.description.slice(0, 80));
  check("Canonical URL present", !!head.canonical, head.canonical);
  check("Open Graph image declared", !!head.ogImage, head.ogImage);
  check("Twitter card declared", head.twitter === "summary_large_image", head.twitter);
  check("SoftwareApplication JSON-LD present", /SoftwareApplication/.test(head.jsonLd));
  check("Build version shown", /v\d+\.\d+\.\d+/.test(head.version), head.version);
  for (const p of ["robots.txt", "sitemap.xml", "og-image.png", "version.json"]) {
    const res = await page.request.get(new URL(p, BASE).href);
    check(`/${p} is served`, res.status() === 200 && !/text\/html/.test(res.headers()["content-type"] ?? ""), `${res.status()} ${res.headers()["content-type"]}`);
  }
  if (head.ogImage) {
    // og:image is absolute (production URL by default); check the same path on the target.
    const url = new URL(new URL(head.ogImage).pathname, origin).href;
    const res = await page.request.get(url);
    check("og:image path resolves to a PNG on the target", res.status() === 200 && /image\/png/.test(res.headers()["content-type"] ?? ""), `${res.status()} ${url}`);
  }

  // 2. Import + preview.
  await page.setInputFiles('[data-testid="file-input"]', path.join(samples, "landscape-1920.mp4"));
  await page.waitForSelector('[data-testid="source-info"]', { timeout: 30000 });
  const src = await page.textContent('[data-testid="source-info"]');
  check("Import: probe shows 1920 × 1080 H.264", /1920 × 1080/.test(src) && /AVC/i.test(src), src.replace(/\s+/g, " "));
  await page.waitForFunction(() => (document.querySelector("video")?.readyState ?? 0) >= 2, null, { timeout: 15000 });
  check("Preview: <video> decoded a frame", (await page.evaluate(() => document.querySelector("video").videoWidth)) === 1920);
  check("No workers left after probing", (await waitNoWorkers()) === 0);
  const heap0 = await heapMB();

  // 3. Trim, crop, resolution, FPS → GIF.
  await setInput("#clip-start", "1");
  await setInput("#clip-end", "3");
  await page.getByRole("radio", { name: "1:1" }).click();
  await setInput("#out-width", "480");
  await page.selectOption("#out-fps", "12");
  const a = await exportGif("smoke-a.gif");
  const g = inspectGif(a.file);
  check("GIF: 480×480, 2.00 s, loops forever", g.w === 480 && g.h === 480 && g.totalCs === 200 && g.loop === 0, `${g.w}×${g.h} ${g.totalCs}cs loop=${g.loop}`);
  const cg = await decodeGifInBrowser(page);
  check("GIF: Chrome decodes every frame", cg.frames === g.delays.length && cg.size.join() === "480,480", JSON.stringify(cg));
  check("GIF: decoded duration matches 2.00 s", Math.abs(cg.durationMs - 2000) <= 10, `${cg.durationMs} ms`);
  check("GIF: last composited frame fully opaque (disposal/transparency correct)", cg.transparentPixelsInLast === 0, String(cg.transparentPixelsInLast));
  check("GIF: download name and size match the result panel", a.suggested === "landscape-1920-480x480.gif" && a.info.includes(fmtBytes(statSync(a.file).size)), a.suggested);
  check("No workers left after GIF export", (await waitNoWorkers()) === 0);

  // 4. Silent MP4 of the same edit.
  const mp4Button = page.getByRole("button", { name: /Export as Silent MP4/ });
  if (await mp4Button.isEnabled()) {
    await mp4Button.click();
    await page.waitForSelector('video[data-testid="result-preview"]', { timeout: 180000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-testid="download"]')]);
    const file = path.join(outDir, "smoke-b.mp4");
    await dl.saveAs(file);
    const m = await inspectMp4(file);
    check("MP4: H.264, 480×480, 2.0 s, no audio track", /avc/.test(m.codec) && m.width === 480 && m.height === 480 && Math.abs(m.duration - 2) < 0.05 && m.audioTracks === 0, JSON.stringify(m));
    check("No workers left after MP4 export", (await waitNoWorkers()) === 0);
  } else r.skip("MP4 export", "H.264 encoding unavailable in this browser");

  // 5. Cancel, then repeated exports with changed settings: no worker leaks, no stuck state.
  await page.getByRole("button", { name: "Back to editing" }).click();
  // "Export as Silent MP4" switched the edit to MP4; go back to GIF.
  await page.getByRole("radio", { name: "GIF" }).click();
  await page.getByRole("radio", { name: "HD" }).click();
  await setInput("#clip-start", "0");
  await setInput("#clip-end", "8");
  await page.getByRole("button", { name: "Export GIF", exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") ?? 0) >= 5, null, { timeout: 60000 });
  check("Cancel: a worker is running mid-export", page.workers().length === 1, String(page.workers().length));
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  check("Cancel: worker terminated (no CPU keeps burning)", (await waitNoWorkers(1000)) === 0);
  await page.waitForSelector('button:has-text("Export GIF")', { timeout: 5000 });
  check("Cancel: back to the editor with settings kept", (await page.getByRole("radio", { name: "HD" }).getAttribute("aria-checked")) === "true");

  const heaps = [];
  await setInput("#clip-end", "2");
  for (const [i, fps] of [
    [1, "15"],
    [2, "15"],
    [3, "10"],
  ]) {
    await page.selectOption("#out-fps", fps);
    const x = await exportGif(`smoke-repeat-${i}.gif`);
    const gi = inspectGif(x.file);
    check(`Repeat export ${i} (${fps} fps) valid — 1:1 crop of 1080 p stays 1080 (no upscale)`, gi.w === 1080 && gi.h === 1080 && gi.totalCs === 200, `${gi.w}×${gi.h} ${gi.totalCs}cs ${gi.delays.length} frames`);
    check(`Repeat export ${i}: no workers left`, (await waitNoWorkers()) === 0);
    await page.getByRole("button", { name: "Back to editing" }).click();
    heaps.push(await heapMB());
  }
  // Cancel once more and recover.
  await page.getByRole("button", { name: "Export GIF", exact: true }).click();
  await page.waitForSelector('[role="progressbar"]');
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  check("Second cancel: worker terminated", (await waitNoWorkers(1000)) === 0);
  const last = await exportGif("smoke-after-cancel.gif");
  check("Export after second cancel succeeds", inspectGif(last.file).totalCs === 200);
  await page.getByRole("button", { name: "Back to editing" }).click();
  heaps.push(await heapMB());
  const blobs = await page.evaluate(() => [...document.querySelectorAll("video,img,a")].map((e) => e.src || e.href).filter((u) => u?.startsWith("blob:")).length);
  check("Only the source and current result blob URLs are referenced", blobs <= 2, String(blobs));
  const growth = Math.max(...heaps) - heap0;
  check("Main-thread JS heap does not keep growing across exports (< 30 MB)", growth < 30, `start ${heap0.toFixed(1)} MB, after each: ${heaps.map((h) => h.toFixed(1)).join(" / ")} MB`);

  // 6. Language switch.
  await page.getByRole("button", { name: "中文" }).click();
  check("Switch to Chinese", (await page.textContent("body")).includes("导出 GIF") && (await page.evaluate(() => document.documentElement.lang)) === "zh-CN");
  await page.getByRole("button", { name: "English" }).click();
  check("Switch back to English", (await page.textContent("body")).includes("Export GIF") && (await page.evaluate(() => document.documentElement.lang)) === "en");

  // 7. Phone-sized viewport (Chromium emulation — not a real mobile browser).
  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mobile.addInitScript(() => localStorage.setItem("lang", "en"));
  const mp = await mobile.newPage();
  await mp.goto(BASE);
  await mp.setInputFiles('[data-testid="file-input"]', path.join(samples, "portrait-phone.mp4"));
  await mp.waitForSelector('[data-testid="source-info"]', { timeout: 30000 });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("375 px viewport: editor without horizontal overflow", overflow <= 0, `${overflow}px`);
  await mp.screenshot({ path: path.join(outDir, "editor-375.png"), fullPage: true });
  await mobile.close();

  check("No page errors in console", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  check("No failed (4xx/5xx) responses during the flow", badResponses.length === 0, badResponses.slice(0, 5).join(" | "));
  check("Privacy: only same-origin GET requests", foreign.length === 0, foreign.slice(0, 5).join(" | "));
} catch (e) {
  check("smoke run completed", false, e.stack);
  await page.screenshot({ path: path.join(outDir, "failure.png") }).catch(() => {});
} finally {
  await browser.close();
  server?.close();
}

console.log(`\n${r.results.length - r.failures}/${r.results.length} checks passed${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}. Target: ${BASE}`);
process.exit(r.failures ? 1 : 0);
