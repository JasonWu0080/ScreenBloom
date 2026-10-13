# Browser Support

ScreenBloom needs these browser capabilities. The app checks each one at runtime and explains
what is missing; it never decides support from the browser's name.

| Capability | Needed for | How it is checked |
| --- | --- | --- |
| Secure context (HTTPS or `localhost`) | WebCodecs is only exposed in secure contexts | `window.isSecureContext` on page load |
| Module Dedicated Workers | All decoding and encoding | `typeof Worker`, plus the worker reporting `ready` |
| WebCodecs `VideoDecoder` | Opening any video | API presence, then `canDecode()` for the file's codec and decoding its first frame |
| `OffscreenCanvas` (2D) | Crop, scale, reading pixels in the worker | API presence |
| WebCodecs `VideoEncoder` with H.264 | Silent MP4 export only | `canEncodeVideo("avc", …)` with the actual size, bitrate and frame rate before each export |

Which **input formats** open depends on the browser's decoders. Tested inputs are listed below.

## Compatibility matrix

Status as of 2026-10-13. "Verified" means the automated end-to-end suite passed in that browser.

| Platform | Browser | Import | GIF | MP4 | Status |
| --- | --- | --- | --- | --- | --- |
| macOS 15.6 (Apple M4) | Chrome 155 | Verified | Verified | Verified | **Supported** |
| Windows | Chrome | Not verified | Not verified | Not verified | Untested |
| Windows | Edge | Not verified | Not verified | Not verified | Untested |
| macOS | Safari | Not verified | Not verified | Not verified | Untested |
| macOS | Firefox | Not verified | Not verified | Not verified | Untested |
| Android | Chrome | Not verified | Not verified | Not verified | Untested |
| iOS | Safari | Not verified | Not verified | Not verified | Untested |
| Linux (CI, headless) | Chrome | Not yet run | Not yet run | Not yet run | Configured in CI, results pending |

Inputs verified in macOS Chrome 155 (synthetic recordings from `scripts/make-samples.mjs`, not
real device captures): MP4 H.264 (+AAC) up to 5120×2880, WebM VP9, MOV H.264 with 90° rotation
metadata, MOV HEVC with rotation (decodable on macOS), variable-frame-rate MP4. Unreadable,
truncated and audio-only files show the correct error.

Not covered by any test yet: real iPhone/Android screen recordings, HDR / 10-bit video,
sources over ~10 MB except the stress samples, and touch-only interaction.

## Manual verification

To verify a browser, serve a production build over `localhost` or HTTPS:

```bash
npm run build && npm start
```

Then, in the browser under test (use `npm run samples` to get test files, or your own recordings):

1. **Capability messages** — the home page shows no "unsupported" warning. If it does, note which.
2. **Import** — open `landscape-text-1440p.mp4`, `landscape-vp9.webm` and `portrait-rotated.mov`. The info panel shows the right size (780 × 1688 for the rotated file) and the preview is upright.
3. **GIF** — trim to 1–4 s, speed 2×, hold 0.5 s / 1 s, "Play 3 times", export. Expect 960 × 540, 3.00 s, the GIF plays three times. Check the downloaded file in another viewer.
4. **MP4** — on the result page choose "Export as Silent MP4". Expect 960 × 540, 3.00 s, and the file plays with no audio track (`ffprobe` shows a single h264 stream). If MP4 is unavailable, the format option must be disabled with an explanation instead.
5. **Crop** — choose 1:1, drag the crop box and a corner, export; the result shows the selected region.
6. **Cancel** — start an HD GIF export of the full clip, cancel at ~20 %, then export again. Settings stay, the second export completes.
7. **Replace file** — replace the file; the confirmation appears and the new file starts with defaults.
8. **Layout** — switch language; on a phone or a 375 px wide window there is no horizontal scrolling.

Record the browser version, OS, device, and the result of each step, and update the matrix
above only with what you observed (a PR is welcome).
