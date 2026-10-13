# Performance

Measured export times and sizes. Numbers depend heavily on the device, the browser and the
content; treat them as one data point, not a guarantee.

## How to reproduce

```bash
node scripts/make-samples.mjs --stress
```

```bash
npm run build && npm run e2e:stress
```

`tests/e2e/stress.mjs` drives the real UI in Google Chrome and prints the wall-clock time from
clicking *Export* until the result is shown (decode + encode + file creation), together with
the exported file's properties. No warm-up or averaging; the table lists the two runs made on
the same day (run 1 / run 2).

## Results

- **Date:** 2026-10-13
- **Device:** Apple M4, 16 GB RAM, macOS 15.6
- **Browser:** Google Chrome 155.0.8059.40 (driven by Playwright 1.64, headless)
- **Build:** ScreenBloom 0.1.0 production static export

| Input | Output settings | Wall time (run 1 / run 2) | Output |
| --- | --- | --- | --- |
| 5120×2880 H.264, 30 fps, 5 s, 7.5 MB | GIF, HD preset (1280 px, 24 fps, dithering) | 9.9 s / 8.9 s | 1280×720, 5.00 s, 120 frames, 3.99 MB |
| 5120×2880 H.264, 30 fps, 5 s, 7.5 MB | MP4, 1920 px, 24 fps, high quality | 6.3 s / 6.3 s | 1920×1080, 5.00 s, 120 frames, 1.49 MB |
| 1920×1080 H.264, 30 fps, 62 s, 4.9 MB (first 60 s) | GIF, Balanced (960 px, 15 fps) | 9.3 s / 9.3 s | 960×540, 60.0 s, 898 frames written, 15.32 MB |
| 1920×1080 H.264, 30 fps, 62 s, 4.9 MB | MP4, Balanced (960 px, 15 fps) | 2.8 s / 2.8 s | 960×540, 62.0 s, 930 frames, 4.47 MB |
| 6144×3456 H.264, 2 s | — | — | Rejected before processing (above the 5120 px source limit) |

The inputs are synthetic screen recordings (a web page with text, scrolling, a gradient
header and CSS animations, recorded by Chrome and transcoded with ffmpeg). The 62 s clip is a
looped 8 s recording, which favors frame differencing less than a real recording with long
pauses would.

"Frames written" for GIF is after identical-frame merging (900 planned frames → 898 written).

## Limits

The limits in [`src/lib/config.ts`](../src/lib/config.ts) were chosen from these runs: a 60 s
/ 1500-frame GIF cap keeps encode time around ten seconds on this device and file sizes in a
range that is still practical to share; 5120 px sources decode reliably while 6144 px sources
are rejected up front. Slower or memory-constrained devices (especially phones) have not been
measured. Change a limit only together with a new measurement recorded here.

## Not measured yet

- Windows, Linux, Android and iOS devices; Safari, Firefox and Edge.
- Peak memory use.
- Real (non-synthetic) recordings.
