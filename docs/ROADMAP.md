# Roadmap

This roadmap shows direction, not commitments. Everything planned must keep the core
principles: local processing, no uploads, no backend, no accounts, no tracking.

Legend: **Done** — shipped · **Planned** — intended for that version · **Exploring** — being evaluated, may change or be dropped.

## v0.1.0 — Open source release (Done)

- Video import with real capability detection
- Trim, crop (with aspect locks and rotation handling), resize
- Frame rate, speed, first / last frame hold
- GIF export (global palette, ordered dithering, frame differencing, own GIF89a + LZW writer)
- Silent MP4 export (H.264 via WebCodecs)
- Local processing in a per-job Dedicated Worker; real progress and cancel
- English and Simplified Chinese UI
- MIT license, GitHub CI, documentation

## v0.2.0 — Browser recording (Planned)

- Record the screen, a window or a tab directly in the browser (`getDisplayMedia` + `MediaRecorder`)
- Recording preview, then straight into the existing editing workflow (the recorder only needs to produce a `File`/`Blob` for the existing loader)
- Broader browser compatibility, starting with verifying Edge, Safari and Firefox

## v0.3.0 — Developer-focused editing (Planned)

- Mouse click highlight
- Text and arrow annotations
- Privacy masking (blur / block out regions)
- Presets for GitHub READMEs

## v0.4.0 — Smart optimization (Planned)

- Target GIF file size
- Automatic parameter search to hit a size target
- More encoding presets and a clearer quality / size trade-off

## v1.0.0 — Reusable media core (Exploring)

- An independent TypeScript API for the media core
- A separate media core package and SDK documentation
- Additional export formats

Whether to publish an npm package will be decided by actual demand. No plugin system is planned.

## Not planned

- Uploading videos, server-side or cloud processing, accounts, analytics
- FFmpeg/WASM
