// Generates synthetic "screen recordings" for manual and automated testing.
// Requires Google Chrome (used through Playwright's `channel: 'chrome'`) and ffmpeg on PATH.
// Output: samples/*.{mp4,webm,mov} — see samples/README.txt for what each file covers.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'samples');
const tmp = path.join(out, '.raw');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pageUrl = 'file://' + path.join(root, 'scripts', 'sample-page.html');

const ff = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

async function record(name, viewport, scale, seconds) {
  const browser = await chromium.launch({ channel: 'chrome' });
  // Playwright records at CSS-pixel size, so emulate a HiDPI capture with a large viewport + CSS zoom.
  const size = { width: viewport.width * scale, height: viewport.height * scale };
  const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: tmp, size } });
  const page = await ctx.newPage();
  await page.goto(pageUrl);
  await page.evaluate((z) => { document.documentElement.style.zoom = String(z); }, scale);
  const steps = seconds * 10;
  for (let i = 0; i < steps; i++) {
    // Pause, then scroll smoothly, then pause again: typical tutorial recording rhythm.
    if (i > steps * 0.25 && i < steps * 0.75) await page.evaluate(() => document.getElementById('scroller').scrollBy(0, 14));
    await page.waitForTimeout(100);
  }
  const video = page.video();
  await ctx.close();
  await browser.close();
  const file = path.join(tmp, name + '.webm');
  renameSync(await video.path(), file);
  return file;
}

const landRaw = await record('landscape', { width: 1280, height: 720 }, 2, 8);
const portRaw = await record('portrait', { width: 390, height: 844 }, 2, 6);

// 1. Landscape text UI, H.264 + AAC audio (audio lets us verify the MP4 export drops it).
ff('-i', landRaw, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-shortest',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '18', '-c:a', 'aac', '-movflags', '+faststart',
  path.join(out, 'landscape-text-1440p.mp4'));
// Downscale to 1920x1080 variant for realistic size; keep 2560x1440 as the "retina" one.
ff('-i', landRaw, '-vf', 'scale=1920:1080', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '20',
  path.join(out, 'landscape-1920.mp4'));
// 2. WebM VP9 (what Chrome/OBS often produce).
ff('-i', landRaw, '-vf', 'scale=1280:720', '-c:v', 'libvpx-vp9', '-b:v', '1M', '-deadline', 'realtime', '-cpu-used', '8',
  path.join(out, 'landscape-vp9.webm'));
// 3. Portrait phone recording stored upright.
ff('-i', portRaw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '18', path.join(out, 'portrait-phone.mp4'));
// 4. Phone-style file: frames stored landscape with a 90° display matrix (like iPhone MOV), HEVC.
const stored = path.join(tmp, 'stored-landscape.mp4');
ff('-i', portRaw, '-vf', 'transpose=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '18', stored);
ff('-display_rotation', '-90', '-i', stored, '-c', 'copy', path.join(out, 'portrait-rotated.mov'));
try {
  ff('-i', portRaw, '-vf', 'transpose=2', '-c:v', 'hevc_videotoolbox', '-tag:v', 'hvc1', '-b:v', '4M', '-r', '30', path.join(tmp, 'stored-hevc.mov'));
  ff('-display_rotation', '-90', '-i', path.join(tmp, 'stored-hevc.mov'), '-c', 'copy', path.join(out, 'portrait-rotated-hevc.mov'));
} catch { console.warn('HEVC sample skipped (no hevc_videotoolbox)'); }
// 5. Variable frame rate: drop ~40% of frames pseudo-randomly, keep original timestamps.
ff('-i', landRaw, '-vf', "scale=1280:720,select='not(mod(n\\,5))+lt(random(1)\\,0.6)'", '-fps_mode', 'vfr',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(out, 'vfr-1280.mp4'));
// 6. Broken inputs.
writeFileSync(path.join(out, 'broken-not-video.mp4'), 'this is plain text, not a video\n'.repeat(100));
const full = readFileSync(path.join(out, 'landscape-1920.mp4'));
writeFileSync(path.join(out, 'broken-truncated.mp4'), full.subarray(0, Math.floor(full.length * 0.02)));
ff('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '1', '-c:a', 'aac', path.join(out, 'broken-audio-only.mp4'));

// Optional large inputs for tests/e2e/stress.mjs: node scripts/make-samples.mjs --stress
if (process.argv.includes('--stress')) {
  const sd = path.join(out, 'stress');
  mkdirSync(sd, { recursive: true });
  const src = path.join(out, 'landscape-1920.mp4');
  ff('-i', src, '-t', '5', '-vf', 'scale=5120:2880:flags=lanczos', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', path.join(sd, '5k.mp4'));
  ff('-i', src, '-t', '2', '-vf', 'scale=6144:3456', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(sd, '6k.mp4'));
  ff('-stream_loop', '7', '-i', src, '-t', '62', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', path.join(sd, 'long-62s.mp4'));
}

rmSync(tmp, { recursive: true, force: true });
writeFileSync(path.join(out, 'README.txt'), `Generated by scripts/make-samples.mjs (synthetic, not real device captures).
landscape-text-1440p.mp4  2560x1440 H.264 + AAC, text UI, scrolling, gradient, CSS animation
landscape-1920.mp4        1920x1080 H.264, same content
landscape-vp9.webm        1280x720 VP9 WebM
portrait-phone.mp4        780x1688 H.264, portrait stored upright
portrait-rotated.mov      H.264 stored 1688x780 with 90° display rotation (QuickTime MOV)
portrait-rotated-hevc.mov HEVC stored landscape with 90° rotation (iPhone-like)
vfr-1280.mp4              variable frame rate (frames dropped irregularly)
broken-*                  unreadable / truncated / no video track
`);
console.log(readdirSync(out).join('\n'));
