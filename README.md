# ScreenBloom

**A privacy-first, open-source video-to-GIF converter powered by WebCodecs.**

Convert screen recordings into optimized GIFs and silent MP4s entirely in your browser.

[简体中文](README.zh-CN.md) · [Architecture](docs/ARCHITECTURE.md) · [GIF encoder](docs/GIF_ENCODER.md) · [Browser support](docs/BROWSER_SUPPORT.md) · [Roadmap](docs/ROADMAP.md)

- **No uploads.** Your video is read and encoded in the browser tab. Nothing is sent to a server.
- **No backend, no account, no tracking.** The app is a static site; there are no analytics or third-party requests.
- **Optimized GIFs** for UI recordings: one stable global palette, frame differencing, exact frame timing.
- **Static deployment.** `npm run build` produces plain files you can host anywhere.
- **Open source** under the [MIT License](LICENSE).

> **Demo:** a demo GIF is not included yet (see [Release report](docs/OPEN_SOURCE_RELEASE_REPORT.md)).

## Features

Built for GitHub READMEs, bug reports, changelogs, product demos and technical docs.

| Area | What you can do |
| --- | --- |
| Import | Open or drop a local video. Support is decided by actually demuxing and decoding it, not by file extension. |
| Trim | Drag start/end handles or type exact times; "set start / end" from the playhead. |
| Crop | Drag a crop box on the preview, or type pixel values; free, original, 16:9, 1:1, 9:16. Rotated phone videos are handled. |
| Output | Width (never upscaled), frame rate 1–30 fps, speed 0.25–4×, hold first / last frame 0–10 s. |
| Presets | Small (640 px, 10 fps, 128 colors), Balanced (960 px, 15 fps), HD (1280 px, 24 fps, light dithering). |
| GIF | Loop forever or N times, 32–256 colors, optional ordered dithering. |
| Silent MP4 | H.264 video only — there is no audio track at all — with three quality levels. |
| Export | Real progress (frames done / total), elapsed time, cancel at any moment, result preview, download. |
| Languages | English and Simplified Chinese. |

### Local processing limits

Everything runs on the visitor's device, so a few limits keep the tab responsive. They live in one place, [`src/lib/config.ts`](src/lib/config.ts), and exports that exceed them are blocked with an explanation before encoding starts.

| Item | Limit |
| --- | --- |
| Source file size | 2 GB (read lazily, never fully loaded into memory) |
| Source frame, longest side | 5120 px (5K) |
| GIF output | ≤ 60 s and ≤ 1500 frames; longest side ≤ 1600 px |
| MP4 output | ≤ 300 s; longest side ≤ 1920 px |

Measured timings for these sizes are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## Privacy

- Video files are opened as local `File` objects and read in chunks inside a Web Worker. They are never uploaded.
- File names are used only for display and for the download file name.
- There is no analytics, telemetry, external font or CDN. The page only loads its own static files.
- The end-to-end test suite records every network request while importing and exporting, and fails if any request goes to another origin or is not a `GET` of the app's own files.

## How it works

```
React UI ──(edit parameters snapshot)──► Dedicated Worker (one per job)
                                           ├─ Mediabunny: demux + WebCodecs VideoDecoder
                                           ├─ crop + high-quality downscale (OffscreenCanvas)
                                           ├─ GIF: global palette → mapping → frame diff → GIF89a + LZW
                                           └─ MP4: WebCodecs VideoEncoder (H.264) → MP4 muxer
```

- Decoding and encoding use the browser's native **WebCodecs**, through [Mediabunny](https://mediabunny.dev) for demuxing and MP4 muxing.
- The **GIF writer and LZW compressor are this project's own code**; color quantization uses the PnnQuant implementation from [`gifenc`](https://github.com/mattdesl/gifenc). Details: [docs/GIF_ENCODER.md](docs/GIF_ENCODER.md).
- Every export runs in a fresh Dedicated Worker that is terminated when the job ends, fails or is cancelled.
- No FFmpeg/WASM: the worker bundle is about 500 KB (≈130 KB gzipped) and needs no special server headers.

## Quick start

Requirements: Node.js 24 LTS (≥ 22.12), and a desktop Chromium-based browser for using the app.

```bash
npm ci
```

```bash
npm run dev
```

Open <http://localhost:3000>. Use `localhost` (or HTTPS): browsers only expose WebCodecs in secure contexts, so opening the dev server via a LAN IP shows an explanation instead of processing video. To test on other devices, use `npx next dev --experimental-https`.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run check` | Type check + lint + unit tests |
| `npm run build` | Static export to `out/` (also copies `LICENSE` and third-party notices into it) |
| `npm start` | Serves `out/` at <http://127.0.0.1:4173> with the recommended security headers |
| `npm run samples` | Generates synthetic test videos into `samples/` (needs Google Chrome + ffmpeg) |
| `npm run e2e` | End-to-end tests against the production build in Chrome |
| `npm run e2e:stress` | Large-input and limit tests (`node scripts/make-samples.mjs --stress` first) |

Project layout:

```
src/
  app/          Next.js entry (static export)
  components/   UI: home, editor (preview, crop, timeline, settings, export bar), result
  hooks/        useSourceLoader, useExportJob, usePlayback, useCapabilities
  lib/
    edit/       Domain layer — EditParams, validation, crop geometry, output size, frame timing (pure TS)
    jobs/       Worker message protocol and client (one worker per job)
    media/      Probing, capability checks, error classification, frame scaling (worker only)
    encode/     GIF and MP4 pipelines; gif/ = palette, frame differencing, GIF89a writer, LZW (worker only)
    i18n/       English / Chinese messages
  workers/      media.worker.ts
```

## Build

```bash
npm run build
```

The output in `out/` is a static site (≈1.3 MB). The worker bundle is only downloaded when a file is opened.

## Testing

| Suite | Command | Scope |
| --- | --- | --- |
| Unit (Vitest) | `npm test` | Edit parameters and validation, crop geometry, output size, GIF/MP4 frame timing, GIF89a structure, LZW round trips, frame differencing, GIF pipeline pixel regression, error classification |
| End-to-end (Playwright + Chrome) | `npm run e2e` | Real UI, real downloads checked with ffprobe and an independent GIF parser: trim, crop, rotation, VFR, presets, loop count, silent MP4, cancel and re-export, replacing files, object URL cleanup, Chinese/English, small screens, no cross-origin requests |
| Stress | `npm run e2e:stress` | 5K input, 6K rejection, 60 s GIF, 62 s MP4 |

Current results are recorded in [docs/OPEN_SOURCE_RELEASE_REPORT.md](docs/OPEN_SOURCE_RELEASE_REPORT.md).


## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (in Chinese) for layers, data model, worker protocol, pipelines, resource lifecycle, error model and design decisions, and [docs/GIF_ENCODER.md](docs/GIF_ENCODER.md) for the GIF encoder.

## Self-hosting

Build once and upload `out/` to any static host (Nginx, Caddy, object storage, a CDN, GitHub Pages…). It must be served over **HTTPS** (WebCodecs requires a secure context), `.js` files need a JavaScript MIME type, and sub-path hosting is a build option (`BASE_PATH=/tools/gif npm run build`). Full guide with recommended security headers: [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The production build bundles third-party code under its own licenses, including Mediabunny (MPL-2.0); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
