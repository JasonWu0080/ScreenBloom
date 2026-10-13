# Performance

Measured export times and sizes. Numbers depend heavily on the device, the browser and the
content; treat them as data points from one machine, not guarantees. Nothing on this page is
estimated — anything that wasn't measured is marked N/A.

## Test machine

- **Device:** Apple M4, 16 GB RAM, macOS 15.6
- **Browser:** Google Chrome 155.0.8059.40, driven by Playwright 1.64 (headless)
- **Inputs:** synthetic screen recordings from `scripts/make-samples.mjs` (a web page with text,
  scrolling, a gradient header and CSS animations, recorded by Chrome, transcoded by ffmpeg)

## GIF benchmark

```bash
npm run samples && npm run build && npm run bench
```

[`tests/bench/gif-bench.mjs`](../tests/bench/gif-bench.mjs) drives the real UI: a fresh page per
run, one warm-up run, then the **median of 5 runs**. Stage timings are measured inside the
worker (`ExportStats`); "wall" is click → result shown. Results go to
`test-results/bench/gif-bench.json`.

- **Input:** 1920×1080, 10 s, 30 fps H.264 (`samples/bench-1080p30-10s.mp4`)
- **Output:** GIF, 800 px wide (800×450), 15 fps (150 frames), Balanced colors (256, no dithering)

| Metric (median of 5) | v0.1.0 code | v0.1.1 | Change |
| --- | --- | --- | --- |
| Total export time (worker) | 1616 ms | 1204 ms | −26 % |
| Wall time (click → result shown) | 1823 ms | 1322 ms | −27 % |
| Palette pass (12 sampled frames) | 193 ms | 167 ms | |
| Waiting for decoded frames | 46 ms | 39 ms | |
| Processing (crop, scale, pixel readback) | 745 ms | 381 ms | −49 % |
| Encoding (palette mapping, frame differencing, LZW) | 624 ms | 614 ms | |
| Output size (800×450, 150 frames written) | 1.72 MB (1 807 215 B) | 1.72 MB (1 798 481 B) | −0.5 % |
| Effective speed (output frames / total time) | 92.8 fps | 124.6 fps | |
| Peak memory | N/A | N/A | not reliably measurable for a worker without cross-origin isolation |

"v0.1.0 code" is the same benchmark with only the canvas change reverted, measured on the same
day. Decoding runs concurrently with our own work, so "waiting for decoded frames" is the
time the pipeline was blocked on the decoder, not total decoder CPU time.

**What changed in v0.1.1:** the output canvas no longer requests `willReadFrequently`. That hint
makes Chrome use a CPU-backed canvas, so every crop/scale ran in software. Keeping the canvas
GPU-accelerated and reading back one small output frame per step halved the processing time.
Image quality was compared against an ffmpeg Lanczos downscale of the same source frame
(2560×1440 text UI → 960×540): SSIM 0.9630 → 0.9633, PSNR 34.95 → 35.01 dB, i.e. unchanged.

### Regression checks

The benchmark has no fixed time limit — CI runners differ too much. To catch a regression,
compare against a baseline from the **same** machine and browser:

```bash
BENCH_BASELINE=previous/gif-bench.json BENCH_MAX_REGRESSION=0.25 npm run bench
```

It fails when the median total time or output size grows by more than the threshold. The manual
"Stress / limits / benchmark" CI job runs it and uploads the JSON as an artifact.

## Large inputs and limits

```bash
node scripts/make-samples.mjs --stress
```

```bash
npm run build && npm run e2e:stress
```

[`tests/e2e/stress.mjs`](../tests/e2e/stress.mjs) prints wall-clock time from clicking *Export*
until the result is shown. Two runs each, 2026-10-13 (v0.1.0) and 2026-10-14 (v0.1.1):

| Input | Output settings | v0.1.0 (run 1 / 2) | v0.1.1 (run 1 / 2) | Output |
| --- | --- | --- | --- | --- |
| 5120×2880 H.264, 30 fps, 5 s, 7.5 MB | GIF, HD (1280 px, 24 fps, dithering) | 9.9 s / 8.9 s | 8.9 s / 8.9 s | 1280×720, 5.00 s, 120 frames, 3.99 MB |
| 5120×2880 H.264, 30 fps, 5 s, 7.5 MB | MP4, 1920 px, 24 fps, high quality | 6.3 s / 6.3 s | 6.3 s / 6.3 s | 1920×1080, 5.00 s, 120 frames, 1.49 MB |
| 1920×1080 H.264, 30 fps, 62 s (first 60 s) | GIF, Balanced (960 px, 15 fps) | 9.3 s / 9.3 s | 8.3 s / 8.8 s | 960×540, 60.0 s, 898 frames written, 15.32 MB |
| 1920×1080 H.264, 30 fps, 62 s | MP4, Balanced (960 px, 15 fps) | 2.8 s / 2.8 s | 2.8 s / 2.8 s | 960×540, 62.0 s, 930 frames, 4.47 MB |
| 6144×3456 H.264, 2 s | — | rejected | rejected | Rejected before processing (above the 5120 px source limit) |

The 5K cases are dominated by decoding 5K frames, so the canvas change barely affects them.
The 62 s clip is a looped 8 s recording, which favors frame differencing less than a real
recording with long pauses would. "Frames written" is after identical-frame merging.

## Memory and worker lifecycle

Measured by `npm run e2e:smoke` (main-thread JS heap after a forced GC, via the Chrome DevTools
Protocol): across 1 GIF + 1 MP4 export, 2 cancellations and 4 more GIF exports the main-thread
heap stayed between 4.2 and 5.1 MB, and no worker was alive after any export or cancel
(`page.workers()`). Worker heaps are released by `terminate()` and are not measured separately.

## Limits

The limits in [`src/lib/config.ts`](../src/lib/config.ts) were chosen from these runs: a 60 s /
1500-frame GIF cap keeps encode time around ten seconds on this device and file sizes in a
range that is still practical to share; 5120 px sources decode reliably while 6144 px sources
are rejected up front. Slower or memory-constrained devices (especially phones) have not been
measured. Change a limit only together with a new measurement recorded here.

## Not measured yet

- Windows, Linux desktop, Android and iOS devices; Safari, Firefox and Edge.
- Peak memory of the worker.
- Real (non-synthetic) recordings.
