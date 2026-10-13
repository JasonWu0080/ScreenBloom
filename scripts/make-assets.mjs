// Generates the README / social assets from the real app, so they never drift from the UI:
//   docs/assets/screenbloom-preview.png   editor screenshot
//   docs/assets/screenbloom-demo.gif      recorded UI walkthrough, converted to GIF by ScreenBloom itself
//   public/og-image.png                   1200×630 Open Graph card (uses the preview screenshot)
//   src/app/favicon.ico                   16/32/48 px, rendered from src/app/icon.svg
//
// Needs: a production build in out/ (`npm run build`), the synthetic samples (`npm run samples`),
// Google Chrome and ffmpeg. Rebuild afterwards so out/ picks up the new og-image and favicon:
//   npm run build && node scripts/make-assets.mjs && npm run build
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./serve-out.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, "test-results", "assets-tmp");
const assets = path.join(root, "docs", "assets");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(assets, { recursive: true });

const PORT = 4327;
const BASE = `http://127.0.0.1:${PORT}/`;
const sample = path.join(root, "samples", "landscape-1920.mp4");
const server = await serve(PORT);
const browser = await chromium.launch({ channel: "chrome" });
const kb = (f) => `${(statSync(f).size / 1024).toFixed(0)} KB`;

// A visible pointer for the recording: headless screencasts don't include the OS cursor.
function cursorScript() {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l14 8.5-6.2 1.3L7.6 18z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "-40px", top: "-40px", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-3px,-2px)" });
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => Object.assign(c.style, { left: e.clientX + "px", top: e.clientY + "px" }), true);
  });
}

async function glide(page, locator, opts = {}) {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: opts.steps ?? 18 });
  await page.waitForTimeout(120);
}

async function drag(page, locator, dx, dy) {
  const b = await locator.boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y, { steps: 14 });
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

try {
  // 1. Editor screenshot for the README.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => localStorage.setItem("lang", "en"));
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.setInputFiles('[data-testid="file-input"]', sample);
    await page.waitForSelector('[data-testid="source-info"]');
    await page.waitForFunction(() => (document.querySelector("video")?.readyState ?? 0) >= 2);
    await page.fill("#clip-start", "1.5");
    await page.press("#clip-start", "Enter");
    await page.fill("#clip-end", "5");
    await page.press("#clip-end", "Enter");
    const vbox = await page.locator("video").boundingBox();
    await drag(page, page.locator('[data-handle="se"]'), -vbox.width * 0.22, -vbox.height * 0.22);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(assets, "screenbloom-preview.png") });
    await ctx.close();
    console.log(`docs/assets/screenbloom-preview.png  ${kb(path.join(assets, "screenbloom-preview.png"))}`);
  }

  // 2. Record a walkthrough with Chrome's screencast (lossless PNG frames + timestamps).
  const W = 1200;
  const H = 750;
  const framesDir = path.join(tmp, "frames");
  mkdirSync(framesDir);
  {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    await ctx.addInitScript(() => localStorage.setItem("lang", "en"));
    await ctx.addInitScript(cursorScript);
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.mouse.move(W * 0.7, H * 0.25);
    const cdp = await ctx.newCDPSession(page);
    const frames = [];
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      frames.push({ data, t: metadata.timestamp });
      cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "png", maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    await page.waitForTimeout(1200);

    const choose = page.getByRole("button", { name: "Choose file" });
    await glide(page, choose);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), choose.click()]);
    await chooser.setFiles(sample);
    await page.waitForSelector('[data-testid="source-info"]');
    await page.waitForFunction(() => (document.querySelector("video")?.readyState ?? 0) >= 2);
    await page.waitForTimeout(700);

    const track = await page.locator('[data-kind="seek"]').boundingBox();
    await drag(page, page.getByRole("slider", { name: "Clip start" }), track.width * 0.18, 0);
    await drag(page, page.getByRole("slider", { name: "Clip end" }), -track.width * 0.45, 0);
    const vbox = await page.locator("video").boundingBox();
    await drag(page, page.locator('[data-handle="se"]'), -vbox.width * 0.25, -vbox.height * 0.25);
    await glide(page, page.getByRole("radio", { name: "Small" }));
    await page.getByRole("radio", { name: "Small" }).click();
    await page.waitForTimeout(500);
    await glide(page, page.getByRole("radio", { name: "Balanced" }));
    await page.getByRole("radio", { name: "Balanced" }).click();
    await page.waitForTimeout(500);

    const exportBtn = page.getByRole("button", { name: "Export GIF", exact: true });
    await glide(page, exportBtn);
    await exportBtn.click();
    await page.waitForSelector('img[data-testid="result-preview"]', { timeout: 120000 });
    await page.waitForTimeout(1500);
    await glide(page, page.locator('[data-testid="download"]'), { steps: 24 });
    await page.waitForTimeout(1800);
    await cdp.send("Page.stopScreencast");
    await ctx.close();

    // Variable frame timing → ffconcat list → constant-rate H.264 the app can open.
    const list = ["ffconcat version 1.0"];
    frames.forEach((f, i) => {
      const file = path.join(framesDir, `f${String(i).padStart(5, "0")}.png`);
      writeFileSync(file, Buffer.from(f.data, "base64"));
      const dur = i + 1 < frames.length ? frames[i + 1].t - f.t : 0.5;
      list.push(`file '${file}'`, `duration ${Math.max(0.001, dur).toFixed(4)}`);
    });
    list.push(`file '${path.join(framesDir, `f${String(frames.length - 1).padStart(5, "0")}.png`)}'`);
    writeFileSync(path.join(tmp, "frames.txt"), list.join("\n"));
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(tmp, "frames.txt"),
      "-vf", `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-crf", "12", path.join(tmp, "walkthrough.mp4")]);
    console.log(`recorded ${frames.length} screencast frames → walkthrough.mp4`);
  }

  // 3. Turn the recording into the README GIF with ScreenBloom itself.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await ctx.addInitScript(() => localStorage.setItem("lang", "en"));
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.setInputFiles('[data-testid="file-input"]', path.join(tmp, "walkthrough.mp4"));
    await page.waitForSelector('[data-testid="source-info"]');
    await page.fill("#out-width", "960");
    await page.press("#out-width", "Enter");
    await page.selectOption("#out-fps", "12");
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    await page.waitForSelector('img[data-testid="result-preview"]', { timeout: 300000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-testid="download"]')]);
    await dl.saveAs(path.join(assets, "screenbloom-demo.gif"));
    const info = (await page.textContent('[data-testid="result-info"]')).replace(/\s+/g, " ");
    await ctx.close();
    console.log(`docs/assets/screenbloom-demo.gif  ${kb(path.join(assets, "screenbloom-demo.gif"))}  (${info})`);
  }

  // 4. Open Graph card, built from the real editor screenshot.
  {
    const shot = readFileSync(path.join(assets, "screenbloom-preview.png")).toString("base64");
    const icon = readFileSync(path.join(root, "src", "app", "icon.svg"), "utf8");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;margin:0}
      body{width:1200px;height:630px;overflow:hidden;background:#f6f6f7;color:#18181b;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
      .copy{position:absolute;left:72px;top:96px;width:470px}
      .brand{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:650;letter-spacing:-.01em}
      .brand svg{width:52px;height:52px}
      h1{margin-top:44px;font-size:60px;line-height:1.05;font-weight:700;letter-spacing:-.025em}
      p{margin-top:22px;font-size:25px;line-height:1.4;color:#52525b}
      .chips{position:absolute;left:72px;bottom:72px;display:flex;gap:10px}
      .chip{padding:9px 16px;border-radius:999px;background:#eaf0fd;color:#2549b0;font-size:19px;font-weight:600}
      .shot{position:absolute;left:600px;top:84px;width:780px;border-radius:14px;overflow:hidden;
        border:1px solid #cfcfd6;box-shadow:0 24px 60px rgba(24,24,27,.18)}
      .shot img{display:block;width:100%}
    </style></head><body>
      <div class="copy">
        <div class="brand">${icon}ScreenBloom</div>
        <h1>Video to GIF,<br>in your browser.</h1>
        <p>Trim, crop and export optimized GIFs. Your videos never leave your device.</p>
      </div>
      <div class="chips"><span class="chip">Privacy-first</span><span class="chip">No uploads</span><span class="chip">Open source · MIT</span></div>
      <div class="shot"><img src="data:image/png;base64,${shot}"></div>
    </body></html>`;
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(html);
    await page.screenshot({ path: path.join(root, "public", "og-image.png") });
    await page.close();
    console.log(`public/og-image.png  ${kb(path.join(root, "public", "og-image.png"))}`);
  }

  // 5. favicon.ico (PNG-compressed entries, supported by every current browser).
  {
    const svg = readFileSync(path.join(root, "src", "app", "icon.svg")).toString("base64");
    const page = await browser.newPage();
    const pngs = [];
    for (const s of [16, 32, 48]) {
      await page.setViewportSize({ width: s, height: s });
      await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="data:image/svg+xml;base64,${svg}" width="${s}" height="${s}" style="display:block">`);
      pngs.push([s, await page.screenshot({ omitBackground: true })]);
    }
    await page.close();
    const header = Buffer.alloc(6 + 16 * pngs.length);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(pngs.length, 4);
    let offset = header.length;
    pngs.forEach(([s, png], i) => {
      const e = 6 + i * 16;
      header.writeUInt8(s, e);
      header.writeUInt8(s, e + 1);
      header.writeUInt16LE(1, e + 4);
      header.writeUInt16LE(32, e + 6);
      header.writeUInt32LE(png.length, e + 8);
      header.writeUInt32LE(offset, e + 12);
      offset += png.length;
    });
    writeFileSync(path.join(root, "src", "app", "favicon.ico"), Buffer.concat([header, ...pngs.map(([, p]) => p)]));
    console.log(`src/app/favicon.ico  ${kb(path.join(root, "src", "app", "favicon.ico"))}`);
  }
} finally {
  await browser.close();
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}
