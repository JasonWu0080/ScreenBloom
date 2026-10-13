# Browser Compatibility

ScreenBloom decides support by testing what the browser can actually do, never by its name.
This page separates what has been **run** from what is only expected.

## Status definitions

| Status | Meaning |
| --- | --- |
| **Verified** | The automated end-to-end suite passed in that browser and platform. |
| **Partially verified** | Only part of the flow was exercised, or only in emulation. The note says which part. |
| **Not tested** | Nobody has run it yet. It may work; we don't know. |
| **Unsupported** | Required APIs are missing, so the app shows an explanation instead of processing video. |

## Required capabilities

The app checks each one at runtime ([`src/lib/capabilities.ts`](../src/lib/capabilities.ts)) and
lists exactly what is missing.

| Capability | Needed for | How it is checked |
| --- | --- | --- |
| Secure context (HTTPS or `localhost`) | WebCodecs only exists in secure contexts | `window.isSecureContext` on page load |
| Module Dedicated Worker (`Worker`) | All decoding and encoding run off the main thread | API presence, then the worker reporting `ready` |
| WebCodecs `VideoDecoder`, `EncodedVideoChunk`, `VideoFrame` | Opening any video (used through Mediabunny) | API presence on the page and in the worker, then `canDecode()` for the file's codec and decoding its first frame |
| `OffscreenCanvas` with a 2D context | Crop, scale and reading pixels in the worker | API presence and `getContext("2d")` |
| WebCodecs `VideoEncoder` **with H.264** | Silent MP4 export only | `canEncodeVideo("avc", …)` — once with 1280×720 for the UI, then before every MP4 export with the real size, bitrate and frame rate. `VideoEncoder` existing is not enough. |

When H.264 encoding is unavailable, the MP4 option is disabled with an explanation and **GIF
export keeps working**. When a required API is missing, the page names it (for example
"This browser is missing required features (VideoDecoder, VideoFrame)") and disables the file picker.

## Matrix

Last updated 2026-10-14 for v0.1.1.

| Platform | Browser | Status | Evidence |
| --- | --- | --- | --- |
| macOS 15.6, Apple M4 | Google Chrome 155.0.8059.40 | **Verified** | `npm run e2e` 69/69 (incl. HEVC input), `npm run e2e:smoke` 46/46, `npm run e2e:stress` — see [TEST_REPORT_V1](audits/TEST_REPORT_V1.md) |
| macOS 15.6, Apple M4 | Google Chrome 155, **production site** | **Verified** (core path) | `E2E_BASE_URL=https://screenbloom.storyweave.cloud npm run e2e:smoke` against the v0.1.0 deployment: all functional checks passed |
| Linux (GitHub Actions `ubuntu-24.04`, headless) | Google Chrome stable | **Verified** except HEVC input | CI E2E 52/52 passed, 1 skipped (HEVC sample can only be generated on macOS) on 2026-10-13 |
| 375 × 812 viewport (Chrome device emulation) | Google Chrome 155 | **Partially verified** | Layout without horizontal overflow and file import. This is emulation in desktop Chrome, **not** a mobile browser. |
| Any | Desktop Chromium (Playwright build) | Not tested | Not installed on the test machine |
| Windows | Chrome, Edge | Not tested | |
| macOS | Safari | Not tested | Installed, but Safari automation requires enabling *Allow Remote Automation*, which was not done |
| macOS / Windows / Linux | Firefox | Not tested | |
| Android | Chrome | Not tested | |
| iOS / iPadOS | Safari | Not tested | |
| Any | A browser without the required APIs | **Unsupported** (handled) | E2E scenario L removes `VideoDecoder`/`VideoFrame` and checks the specific message and the disabled picker |
| Any | Page opened over plain HTTP (not `localhost`) | **Unsupported** (handled) | The browser hides WebCodecs; the page explains how to open it over HTTPS. Message implemented, not covered by an automated test. |

### Expected, but not verified

These follow from the vendors' documented API support. They are **not** test results:

- Chromium-based browsers (Edge, Brave, Opera…) use the same WebCodecs implementation as Chrome
  and are expected to behave like Chrome on the same OS.
- Chromium builds without proprietary codecs (some Linux distributions) are expected to open
  VP8/VP9/AV1 files but not H.264, and to have MP4 export disabled.
- Recent Safari and Firefox releases ship WebCodecs video decoding; whether their decoders,
  OffscreenCanvas and H.264 encoder work with this app has not been checked.

## Inputs verified

In macOS Chrome 155 with synthetic recordings from `scripts/make-samples.mjs` (not real device
captures): MP4 H.264 (+AAC) up to 5120×2880, WebM VP9, MOV H.264 with 90° rotation metadata,
MOV HEVC with rotation (decodable on macOS), variable-frame-rate MP4. Unreadable, truncated
and audio-only files show the correct error. Sources above 5120 px are rejected before
processing.

Not covered by any test yet: real iPhone/Android screen recordings, HDR / 10-bit video,
touch-only interaction on real devices.

## Manual verification

Serve a production build over `localhost` or HTTPS:

```bash
npm run build && npm start
```

Then, in the browser under test (use `npm run samples` for test files):

1. **Capabilities** — the home page shows no warning. If it does, note the APIs it lists.
2. **Import** — open `landscape-text-1440p.mp4`, `landscape-vp9.webm` and `portrait-rotated.mov`. The info panel shows the right size (780 × 1688 for the rotated file) and the preview is upright.
3. **GIF** — trim to 1–4 s, speed 2×, hold 0.5 s / 1 s, "Play 3 times", export. Expect 960 × 540, 3.00 s, the GIF plays three times. Open the download in another viewer.
4. **MP4** — on the result page choose "Export as Silent MP4". Expect 960 × 540, 3.00 s, one H.264 stream, no audio. If MP4 is unavailable, the option must be disabled with an explanation and GIF must still work.
5. **Crop** — choose 1:1, drag the crop box and a corner, export; the result shows the selected region.
6. **Cancel** — start an HD GIF export of the full clip, cancel at ~20 %, export again. Settings stay; the second export completes.
7. **Replace file** — the confirmation appears and the new file starts with defaults.
8. **Layout** — switch language; at 375 px width there is no horizontal scrolling.

The automated suites always drive Google Chrome through Playwright, so other browsers need this
manual checklist.

Please report results (browser + version, OS, device, which steps passed) in an issue or a PR
that updates the matrix — only with what you observed.
