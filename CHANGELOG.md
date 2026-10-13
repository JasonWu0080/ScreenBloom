# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-10-14

Post-launch maintenance release. No change to the editing workflow or the export formats.

### Improvements

- GIF export is about 26 % faster: the scaling canvas stays GPU-accelerated instead of being forced into software rendering by `willReadFrequently`. Benchmark (1920×1080, 10 s → 800 px, 15 fps GIF, Apple M4, Chrome 155, median of 5): 1616 → 1204 ms, same image quality (SSIM/PSNR against a Lanczos reference unchanged), output 0.5 % smaller.
- When the browser lacks a required API, the home page now names it (for example "This browser is missing required features (VideoDecoder, VideoFrame)") instead of a generic message. Detection also covers `EncodedVideoChunk`, `VideoFrame` and a working `OffscreenCanvas` 2D context, on the page and in the worker.
- When H.264 encoding is unavailable, the MP4 option explains that GIF export still works.
- The app now shows its version and Git commit at the bottom of the home page, and every build includes `version.json` (version, commit, build time) to check what is deployed.
- Search and sharing: English page title and description, canonical URL, Open Graph and Twitter card with a 1200×630 image, `robots.txt`, `sitemap.xml`, and SoftwareApplication structured data (no ratings or counts). The static HTML is now rendered in English; the visitor's language is still applied after load.
- ScreenBloom name and icon in the header, browser tab and favicon (replacing "Screen to GIF" / "录屏转 GIF" and the default Next.js icon).
- The worker reports per-stage timings (palette, decode wait, processing, encoding) with each export, used by the new benchmark.

### Bug fixes

- `robots.txt` and `sitemap.xml` returned 404 on the production site; social link previews had no image.
- Release notes generated from this changelog no longer include HTML comments.

### Documentation

- README and README.zh-CN rewritten: online demo link, demo GIF made with ScreenBloom itself, editor screenshot, badges, privacy, compatibility, deployment.
- New `docs/BROWSER_COMPATIBILITY.md` (replaces `BROWSER_SUPPORT.md`) separating verified, partially verified, not tested and unsupported.
- `docs/PERFORMANCE.md` with the new benchmark and v0.1.0 vs v0.1.1 numbers; `docs/SELF_HOSTING.md` documents `SITE_URL`, `version.json` and MIME types.
- Post-launch audit and test report in `docs/audits/`; the v0.1.0 pre-release reports moved there as historical records.
- SECURITY.md: e-mail is the primary private channel (GitHub private vulnerability reporting is not enabled yet). Issue templates ask for browser version, video format, resolution and duration and warn against attaching private recordings; new PR template; CONTRIBUTING lists every command, commit style and the release steps.

### Testing and CI

- Unit tests: 57 → 69 (frame-differencing ghosting regressions under overlapping motion, A → B → A reverts and objects leaving the frame; formatting; capability detection; version display).
- End-to-end checks: 54 → 69 (full-frame GIF decode in Chrome with duration and last-frame opacity, worker terminated on cancel, missing-WebCodecs message, SEO metadata and files, `version.json`).
- New `npm run e2e:smoke`: critical path, worker lifecycle and main-thread memory across repeated exports, runnable against any deployment (`E2E_BASE_URL`); runs in CI.
- New `npm run bench`: GIF benchmark with medians and an optional baseline comparison; runs in the manual CI job and uploads its results.
- CI and release workflows use `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v6` (Node 24) and check the build output (notices, `version.json`, SEO files). The release workflow verifies that tag, `package.json` and `version.json` agree and states in the notes that the zip is a static website build, not a desktop app.

### Compatibility

- Verified: Google Chrome 155 on macOS 15.6 (Apple M4); Google Chrome on Linux in CI (headless). Phone layout checked only in Chrome device emulation.
- Not tested: Edge, Safari, Firefox, Windows, Android, iOS. See `docs/BROWSER_COMPATIBILITY.md`.

### Known limitations

- Requires WebCodecs, `OffscreenCanvas` and module workers in a secure context; MP4 export additionally needs an H.264 encoder.
- One URL serves both languages (switched in the browser), so search engines index the English page.
- Peak memory of the worker is not measured.
- `npm audit` reports 5 high-severity advisories in development-only lint tooling (`eslint-config-next` → `braces`); no fixed version exists yet and nothing from it ships in the site.

## [0.1.0] - 2026-10-13

First public release.

### Added

- Import a local video by choosing or dropping a file; support is decided by actually demuxing it and decoding the first frame in a worker.
- Trim with timeline handles, exact time input, and "set start / end" from the playhead.
- Crop on the preview or with numeric input; free, original, 16:9, 1:1 and 9:16 aspect locks; rotation metadata is applied.
- Output width (never upscaled, even dimensions), frame rate 1–30 fps, speed 0.25–4×, first / last frame hold 0–10 s.
- Quality presets: Small, Balanced, HD.
- GIF export: global palette (PnnQuant via `gifenc`), cached color mapping, optional Bayer 8×8 ordered dithering, identical-frame merging, changed-region frame differencing with transparency, own GIF89a writer and LZW encoder, exact centisecond delays, loop forever or N times.
- Silent MP4 export: H.264 via WebCodecs, constant frame rate, holds as repeated frames, three bitrate levels, video track only.
- Real progress, elapsed time and cancel for exports; each job runs in its own Dedicated Worker that is terminated on completion, failure or cancel.
- Result preview with measured properties and download; exporting the same edit in the other format.
- Local processing limits with explanations before export (file size, source resolution, output duration and frame count).
- English and Simplified Chinese user interface.
- Static export build; no backend, no analytics, no third-party requests.
- The worker re-validates the export parameters with the same rules as the UI before encoding.
- MIT license, third-party notices shipped with the build, contribution guidelines, security policy, CI and draft-release workflows.

[Unreleased]: https://github.com/JasonWu0080/ScreenBloom/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/JasonWu0080/ScreenBloom/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/JasonWu0080/ScreenBloom/releases/tag/v0.1.0
