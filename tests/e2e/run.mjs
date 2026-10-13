// End-to-end checks against the production build (`npm run build` first) in Google Chrome.
// Drives the real UI, downloads the real outputs and inspects them with ffprobe + a GIF parser.
// Usage: npm run samples && npm run build && npm run e2e
import { chromium } from "playwright";
import { ALL_FORMATS, FilePathSource, Input } from "mediabunny";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../../scripts/serve-out.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const samples = path.join(root, "samples");
const outDir = path.join(root, "test-results", "e2e");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}/`;
const results = [];
let failures = 0;

function check(name, ok, info = "") {
  results.push({ name, ok, info });
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`);
}
const skipped = [];
function skip(name, why) {
  skipped.push(name);
  console.log(`SKIP  ${name}  — ${why}`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

function ffprobe(file) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-count_frames", "-of", "json", file]).toString());
}

/**
 * Seconds from the first video sample to the end of the last one, read from the container's
 * sample tables. ffprobe is not used: its VFR durations differ between versions (6.1 vs 8.x).
 */
async function videoTrackSpan(file) {
  const input = new Input({ source: new FilePathSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  return (await track.computeDuration()) - Math.max(0, await track.getFirstTimestamp());
}

/** Parses GIF blocks: logical size, loop count, frame delays. */
function inspectGif(file) {
  const b = readFileSync(file);
  let p = 13;
  const w = b.readUInt16LE(6);
  const h = b.readUInt16LE(8);
  if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1));
  let loop = null;
  const delays = [];
  let pendingDelay = 0;
  for (;;) {
    const t = b[p++];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b[p++];
      if (label === 0xf9) pendingDelay = b.readUInt16LE(p + 2);
      if (label === 0xff && b.toString("ascii", p + 1, p + 12) === "NETSCAPE2.0") loop = b.readUInt16LE(p + 14);
      for (let len = b[p++]; len; len = b[p++]) p += len;
    } else if (t === 0x2c) {
      const flags = b[p + 8];
      p += 9;
      if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
      p++; // min code size
      for (let len = b[p++]; len; len = b[p++]) p += len;
      delays.push(pendingDelay);
    } else throw new Error("bad GIF block");
  }
  return { w, h, loop, delays, totalCs: delays.reduce((s, d) => s + d, 0) };
}

async function setInput(page, selector, value) {
  await page.fill(selector, String(value));
  await page.press(selector, "Enter");
}

async function open(page, file) {
  await page.goto(BASE);
  await page.setInputFiles('[data-testid="file-input"]', path.join(samples, file));
}

async function waitEditor(page) {
  await page.waitForSelector('[data-testid="source-info"]', { timeout: 30000 });
  return page.textContent('[data-testid="source-info"]');
}

async function exportAndDownload(page, label, name) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForSelector('[data-testid="result-preview"]', { timeout: 180000 });
  const info = await page.textContent('[data-testid="result-info"]');
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-testid="download"]')]);
  const file = path.join(outDir, name);
  await download.saveAs(file);
  return { file, info, suggested: download.suggestedFilename() };
}

/** How Chrome itself interprets the exported GIF (loop count, frames). */
async function chromeGifInfo(page) {
  return page.evaluate(async () => {
    const img = document.querySelector('[data-testid="result-preview"]');
    const data = await (await fetch(img.src)).arrayBuffer();
    const dec = new ImageDecoder({ data, type: "image/gif" });
    await dec.tracks.ready;
    const tr = dec.tracks.selectedTrack;
    const out = { frames: tr.frameCount, repetition: tr.repetitionCount, natural: [img.naturalWidth, img.naturalHeight] };
    dec.close();
    return out;
  });
}

const server = await serve(PORT);
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => localStorage.setItem("lang", "en"));
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()));
// Privacy: the app must only ever load its own static files. Video data stays in the page
// (blob:/data: URLs never hit the network), so anything else is a leak.
const origin = new URL(BASE).origin;
const foreignRequests = [];
ctx.on("request", (r) => {
  const u = new URL(r.url());
  if (u.protocol === "blob:" || u.protocol === "data:") return;
  if (u.origin !== origin || r.method() !== "GET") foreignRequests.push(`${r.method()} ${r.url()}`);
});

try {
  // A. Landscape text UI → GIF with trim, speed, holds, finite loop.
  {
    await open(page, "landscape-text-1440p.mp4");
    const info = await waitEditor(page);
    check("A probe reads 2560×1440 H.264 MP4", /2560 × 1440/.test(info) && /AVC/i.test(info), info.replace(/\s+/g, " "));
    await page.screenshot({ path: path.join(outDir, "editor-desktop-en.png") });
    await setInput(page, "#clip-start", "1");
    await setInput(page, "#clip-end", "4");
    await page.selectOption("#out-speed", "2");
    await setInput(page, "#hold-start", "0.5");
    await setInput(page, "#hold-end", "1");
    await page.selectOption("#gif-loop", "3");
    const presetText = await page.textContent("aside");
    check("A preset stays Balanced after timing edits", !/Custom/.test(presetText));
    const { file, info: rinfo, suggested } = await exportAndDownload(page, "Export GIF", "A.gif");
    const g = inspectGif(file);
    const pr = ffprobe(file);
    check("A GIF is 960×540", g.w === 960 && g.h === 540, `${g.w}×${g.h}`);
    check("A GIF total delay = 0.5 + 3/2 + 1 = 3.00 s", g.totalCs === 300, `${g.totalCs} cs`);
    check("A GIF first frame holds ≥ 0.5 s, last ≥ 1 s", g.delays[0] >= 50 && g.delays[g.delays.length - 1] >= 100, `${g.delays[0]} / ${g.delays.at(-1)} cs`);
    check("A GIF no delay below 2 cs", g.delays.every((d) => d >= 2));
    check("A NETSCAPE loop = 2 (play 3 times)", g.loop === 2, String(g.loop));
    check("A ffprobe duration 3.0 s", near(Number(pr.format.duration), 3, 0.02), pr.format.duration);
    const cg = await chromeGifInfo(page);
    check("A Chrome ImageDecoder repetitionCount = 2", cg.repetition === 2, JSON.stringify(cg));
    check("A result panel shows real size", /960 × 540/.test(rinfo) && /(KB|MB)/.test(rinfo), rinfo.replace(/\s+/g, " "));
    check("A download filename", suggested === "landscape-text-1440p-960x540.gif", suggested);
    check("A file size shown matches downloaded bytes", rinfo.includes(fmtBytes(statSync(file).size)), fmtBytes(statSync(file).size));
    await page.screenshot({ path: path.join(outDir, "result-gif-en.png") });

    // B. Same edit → silent MP4 from the result page.
    await page.getByRole("button", { name: /Export as Silent MP4/ }).click();
    await page.waitForSelector('video[data-testid="result-preview"]', { timeout: 180000 });
    const minfo = await page.textContent('[data-testid="result-info"]');
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-testid="download"]')]);
    const mp4 = path.join(outDir, "B.mp4");
    await dl.saveAs(mp4);
    const mp = ffprobe(mp4);
    const v = mp.streams.filter((s) => s.codec_type === "video");
    const a = mp.streams.filter((s) => s.codec_type === "audio");
    check("B MP4 has exactly one H.264 video stream", v.length === 1 && v[0].codec_name === "h264", v.map((s) => s.codec_name).join());
    check("B MP4 has no audio stream (source had AAC)", a.length === 0);
    // Chrome's software H.264 encoder (Linux) flags canvas-sourced frames as full range, which
    // ffprobe reports as yuvj420p; hardware encoders (macOS) emit limited-range yuv420p. Both are 4:2:0.
    check("B MP4 960×540 yuv420p", v[0].width === 960 && v[0].height === 540 && /^yuvj?420p$/.test(v[0].pix_fmt), `${v[0].width}×${v[0].height} ${v[0].pix_fmt}`);
    check("B MP4 duration 3.0 s", near(Number(mp.format.duration), 3, 0.04), mp.format.duration);
    check("B MP4 frame count = 3 s × 15 fps", Number(v[0].nb_read_frames) === 45, v[0].nb_read_frames);
    check("B MP4 container is ISO MP4", /mp4/.test(mp.format.format_name) && /isom|mp4/i.test(mp.format.tags?.major_brand ?? "isom"), `${mp.format.format_name} ${mp.format.tags?.major_brand}`);
    const mime = await page.evaluate(async () => (await fetch(document.querySelector('[data-testid="download"]').href)).headers.get("content-type") ?? (await (await fetch(document.querySelector('[data-testid="download"]').href)).blob()).type);
    check("B blob MIME video/mp4", /video\/mp4/.test(mime), mime);
    check("B both results available after second export", (await page.getByRole("button", { name: "GIF", exact: true }).count()) === 1, minfo.replace(/\s+/g, " "));
    await page.screenshot({ path: path.join(outDir, "result-mp4-en.png") });

    // Back to editing keeps params.
    await page.getByRole("button", { name: "Back to editing" }).click();
    const start = await page.inputValue("#clip-start");
    check("B back to editing keeps the trim", start === "0:01.00", start);
  }

  // C. Rotated phone MOV → 1:1 crop, Small preset.
  {
    await open(page, "portrait-rotated.mov");
    const info = await waitEditor(page);
    check("C rotated MOV displayed as portrait 780×1688", /780 × 1688/.test(info) && /90°/.test(info), info.replace(/\s+/g, " "));
    const vdims = await page.evaluate(() => [document.querySelector("video").videoWidth, document.querySelector("video").videoHeight]);
    check("C <video> preview orientation matches probe", vdims[0] === 780 && vdims[1] === 1688, vdims.join("×"));
    await page.getByRole("radio", { name: "1:1" }).click();
    await page.getByRole("radio", { name: "Small" }).click();
    await setInput(page, "#clip-end", "2");
    await page.screenshot({ path: path.join(outDir, "editor-portrait-crop.png") });
    const crop = await Promise.all(["#crop-x", "#crop-y", "#crop-width", "#crop-height"].map((s) => page.inputValue(s)));
    check("C 1:1 crop centered in 780×1688", crop.join() === "0,454,780,780", crop.join());
    const { file } = await exportAndDownload(page, "Export GIF", "C.gif");
    const g = inspectGif(file);
    check("C GIF 640×640 (small preset long side)", g.w === 640 && g.h === 640, `${g.w}×${g.h}`);
    check("C GIF 2.00 s, loop forever", g.totalCs === 200 && g.loop === 0, `${g.totalCs} cs loop=${g.loop}`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", "select=eq(n\\,10)", "-frames:v", "1", path.join(outDir, "C-frame.png")]);
  }

  // D. iPhone-like HEVC MOV with rotation → MP4. The sample needs macOS VideoToolbox to generate.
  if (!existsSync(path.join(samples, "portrait-rotated-hevc.mov"))) skip("D HEVC MOV", "sample not generated on this platform");
  else {
    await open(page, "portrait-rotated-hevc.mov");
    const ok = await Promise.race([
      waitEditor(page).then((t) => ({ t })),
      page.waitForSelector('main [role="alert"]', { timeout: 30000 }).then(async (e) => ({ err: await e.textContent() })),
    ]);
    if (ok.t) {
      check("D HEVC MOV opens (Chrome on Mac)", /HEVC/i.test(ok.t), ok.t.replace(/\s+/g, " "));
      await page.getByRole("radio", { name: "Silent MP4" }).click();
      await setInput(page, "#clip-end", "2");
      const { file } = await exportAndDownload(page, "Export MP4", "D.mp4");
      const mp = ffprobe(file);
      const v = mp.streams[0];
      check("D MP4 portrait 444×960, 2 s, video only", v.width === 444 && v.height === 960 && mp.streams.length === 1 && near(Number(mp.format.duration), 2, 0.04), `${v.width}×${v.height} ${mp.format.duration}s streams=${mp.streams.length}`);
    } else check("D HEVC MOV opens (Chrome on Mac)", false, ok.err);
  }

  // E. WebM VP9 → GIF HD with dithering.
  {
    await open(page, "landscape-vp9.webm");
    const info = await waitEditor(page);
    check("E WebM VP9 opens", /VP9/i.test(info), info.replace(/\s+/g, " "));
    await page.getByRole("radio", { name: "HD" }).click();
    await setInput(page, "#clip-start", "2");
    await setInput(page, "#clip-end", "5");
    const { file } = await exportAndDownload(page, "Export GIF", "E.gif");
    const g = inspectGif(file);
    check("E GIF 1280×720 (HD, no upscale), 3.00 s", g.w === 1280 && g.h === 720 && g.totalCs === 300, `${g.w}×${g.h} ${g.totalCs}cs`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", "select=eq(n\\,5)", "-frames:v", "1", path.join(outDir, "E-frame.png")]);
  }

  // F. Variable frame rate input.
  {
    await open(page, "vfr-1280.mp4");
    await waitEditor(page);
    await page.selectOption("#out-fps", "10");
    const { file } = await exportAndDownload(page, "Export GIF", "F.gif");
    const g = inspectGif(file);
    const pr = ffprobe(file);
    const srcDur = await videoTrackSpan(path.join(samples, "vfr-1280.mp4"));
    check(`F VFR source → GIF spans the full ${srcDur.toFixed(2)} s at 10 fps`, Math.abs(g.totalCs - srcDur * 100) <= 1, `${g.totalCs} cs, ${g.delays.length} frames written, ffprobe ${pr.format.duration}`);
  }

  // G. Broken inputs show the right category on the home screen.
  for (const [file, re] of [
    ["broken-not-video.mp4", /can't be read/],
    ["broken-truncated.mp4", /can't be read|incomplete/],
    ["broken-audio-only.mp4", /No usable video track/],
  ]) {
    await page.goto(BASE);
    await page.setInputFiles('[data-testid="file-input"]', path.join(samples, file));
    const el = await page.waitForSelector('main [role="alert"]', { timeout: 30000 });
    const text = await el.textContent();
    check(`G ${file} → clear error`, re.test(text), text);
    check(`G ${file} → upload still usable`, await page.getByRole("button", { name: "Choose file" }).isEnabled());
  }

  // H. Cancel mid-export, then export again; params survive.
  {
    await open(page, "landscape-text-1440p.mp4");
    await waitEditor(page);
    await page.getByRole("radio", { name: "HD" }).click();
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") ?? 0) >= 5, null, { timeout: 60000 });
    const workersBefore = await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => /worker/.test(r.name)).length);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForSelector('button:has-text("Export GIF")', { timeout: 5000 });
    const presetAfter = await page.getByRole("radio", { name: "HD" }).getAttribute("aria-checked");
    check("H cancel returns to editor with settings kept", presetAfter === "true");
    check("H no result after cancel", (await page.locator('[data-testid="result-preview"]').count()) === 0);
    await setInput(page, "#clip-end", "2");
    const { file } = await exportAndDownload(page, "Export GIF", "H.gif");
    const g = inspectGif(file);
    check("H re-export after cancel succeeds (1280×720, 2 s)", g.w === 1280 && g.totalCs === 200, `${g.w} ${g.totalCs}cs (worker script fetches before cancel: ${workersBefore})`);

    // I. Replace file asks for confirmation, then loads the new file and drops old results.
    await page.getByRole("button", { name: "Back to editing" }).click();
    await page.getByRole("button", { name: "Replace file" }).click();
    const dialogVisible = await page.locator("dialog[open]").isVisible();
    check("I replace file asks for confirmation when there is work", dialogVisible);
    await page.locator("dialog").getByRole("button", { name: "Cancel" }).click();
    check("I cancel keeps the current file", /landscape-text/.test(await page.textContent('[data-testid="source-info"]')));
    await page.getByRole("button", { name: "Replace file" }).click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator("dialog").getByRole("button", { name: "Replace" }).click()]);
    await chooser.setFiles(path.join(samples, "portrait-phone.mp4"));
    await page.waitForFunction(() => /portrait-phone/.test(document.querySelector('[data-testid="source-info"]')?.textContent ?? ""), null, { timeout: 30000 });
    const p2 = await Promise.all([page.inputValue("#clip-start"), page.getByRole("radio", { name: "Balanced" }).getAttribute("aria-checked")]);
    check("I new file starts with fresh defaults", p2[0] === "0:00.00" && p2[1] === "true", p2.join());
    const oldUrlDead = await page.evaluate(async () => {
      // Every blob: URL the page still references must be live; earlier ones were revoked.
      const live = [...document.querySelectorAll("video,img,a")].map((e) => e.src || e.href).filter((u) => u?.startsWith("blob:"));
      return live.length;
    });
    check("I only the new source blob URL is referenced", oldUrlDead === 1, String(oldUrlDead));
  }

  // J. Layout: Chinese UI, small screen, no horizontal overflow.
  {
    const zh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await zh.addInitScript(() => localStorage.setItem("lang", "zh"));
    const zp = await zh.newPage();
    await zp.goto(BASE);
    await zp.setInputFiles('[data-testid="file-input"]', path.join(samples, "landscape-1920.mp4"));
    await waitEditor(zp);
    check("J Chinese UI renders", (await zp.textContent("body")).includes("导出 GIF"));
    await zp.screenshot({ path: path.join(outDir, "editor-desktop-zh.png") });
    for (const [w, h] of [
      [375, 812],
      [768, 1024],
    ]) {
      await zp.setViewportSize({ width: w, height: h });
      await zp.waitForTimeout(300);
      const overflow = await zp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`J no horizontal overflow at ${w}px (zh)`, overflow <= 0, `${overflow}px`);
      await zp.screenshot({ path: path.join(outDir, `editor-${w}-zh.png`), fullPage: true });
    }
    await zp.getByRole("button", { name: "English" }).click();
    const overflowEn = await zp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("J language switch to English at 768px, no overflow", (await zp.textContent("body")).includes("Export GIF") && overflowEn <= 0);
    await zp.setViewportSize({ width: 375, height: 812 });
    await zp.waitForTimeout(300);
    const overflowEnMobile = await zp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("J no horizontal overflow at 375px (en)", overflowEnMobile <= 0, `${overflowEnMobile}px`);
    await zp.screenshot({ path: path.join(outDir, "editor-375-en.png"), fullPage: true });
    await zp.goto(BASE);
    await zp.screenshot({ path: path.join(outDir, "home-375.png"), fullPage: true });
    await zh.close();
  }

  // K. Crop drag on the preview maps to source pixels and survives a resize.
  {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "landscape-1920.mp4");
    await waitEditor(page);
    const box = await page.locator('[data-handle="se"]').boundingBox();
    const vbox = await page.locator("video").boundingBox();
    const scale = vbox.width / 1920;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 480 * scale, box.y + box.height / 2 - 270 * scale, { steps: 8 });
    await page.mouse.up();
    const crop = await Promise.all(["#crop-width", "#crop-height"].map((s) => page.inputValue(s)));
    check("K dragging corner by 480×270 source px", near(+crop[0], 1440, 3) && near(+crop[1], 810, 3), crop.join("×"));
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.waitForTimeout(300);
    const crop2 = await Promise.all(["#crop-width", "#crop-height"].map((s) => page.inputValue(s)));
    const cropBox = await page.locator('[data-handle="move"]').boundingBox();
    const vbox2 = await page.locator("video").boundingBox();
    check("K crop unchanged after resize, overlay rescaled", crop2.join() === crop.join() && near(cropBox.width / vbox2.width, +crop[0] / 1920, 0.01), `${crop2.join("×")} ratio ${(cropBox.width / vbox2.width).toFixed(3)}`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.selectOption("#out-fps", "10");
    await setInput(page, "#clip-end", "1");
    const { file } = await exportAndDownload(page, "Export GIF", "K.gif");
    const g = inspectGif(file);
    check("K cropped export uses the crop (960×540 from 1440×810 region)", g.w === 960 && g.h === 540, `${g.w}×${g.h}`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-frames:v", "1", path.join(outDir, "K-frame.png")]);
  }

  check("No page errors in console", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  check("Privacy: only same-origin GET requests (main test context)", foreignRequests.length === 0, foreignRequests.slice(0, 5).join(" | "));
} catch (e) {
  check("e2e run completed", false, e.stack);
  await page.screenshot({ path: path.join(outDir, "failure.png") }).catch(() => {});
} finally {
  await browser.close();
  server.close();
}

function fmtBytes(n) {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 ** 2).toFixed(n < 100 * 1024 ** 2 ? 2 : 1)} MB`;
}

console.log(`\n${results.length - failures}/${results.length} checks passed${skipped.length ? `, ${skipped.length} skipped` : ""}. Outputs and screenshots: ${path.relative(root, outDir)}`);
process.exit(failures ? 1 : 0);
