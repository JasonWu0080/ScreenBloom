# Post-Launch Audit V1

| | |
| --- | --- |
| Date | 2026-10-14 |
| Audited version | v0.1.0 (tag `v0.1.0` = commit `2440364`), production <https://screenbloom.storyweave.cloud> |
| Target version | v0.1.1 (prepared in the working tree, not committed, tagged or deployed) |
| Method | Full read of the source, configuration, workflows and docs; local test suites; Playwright + Google Chrome 155 against the local build **and** the production site; GitHub API (read, plus the About settings) |
| Machine | Apple M4, 16 GB, macOS 15.6, Node.js 25.6.1, Google Chrome 155.0.8059.40, ffmpeg 8.0.1 |

The code was taken as the source of truth; documentation was compared against it.

**Summary.** The launched product is in good shape: no P0 problem was found, every functional
check passes on production, and the codebase already had strong GIF-encoder tests. The work for
v0.1.1 is a performance fix in the scaling path, more precise browser-capability handling,
identity/SEO gaps on the live site (wrong product name in the title, default Next.js icon, no
Open Graph image, no robots/sitemap, no way to tell which commit is deployed), CI runtime
deprecation, and documentation/process drift after launch.

---

## 1. Current architecture

A static single-page app (Next.js 16 App Router, `output: "export"`), no backend.

```
Main thread (React 19)                                Dedicated Worker (new one per task)
──────────────────────                                ───────────────────────────────────
App ─ HomeScreen / EditorScreen / ResultScreen        media.worker.ts
  hooks: useSourceLoader  ── runTask(probe) ──────►     missingApis() → probeFile (Mediabunny, decode 1st frame)
         useExportJob     ── runTask(export) ─────►     normalizeParams + checkLimits (same rules as UI)
         useCapabilities  ── runTask(capabilities) ►    exportClip → GIF or MP4 pipeline
         usePlayback (preview <video>, no encoding)     ◄── progress / result (Transferable bytes) / error
  lib/edit (pure domain logic, shared with the worker)
```

Each task creates a worker and `terminate()`s it on success, failure or cancel
([`src/lib/jobs/worker-client.ts`](../../src/lib/jobs/worker-client.ts)). Details:
[ARCHITECTURE.md](../ARCHITECTURE.md).

## 2. Actual technology stack

| Layer | Technology (locked versions) |
| --- | --- |
| Framework | Next.js 16.4.0 (Turbopack, static export), React 19.3.0, TypeScript 5.9 (strict), Tailwind CSS 4 |
| Media | WebCodecs via Mediabunny 1.61.3 (MPL-2.0, unmodified): demux, `CanvasSink` decoding, H.264 `CanvasSource`, MP4 muxing |
| GIF | Own GIF89a writer + LZW (`src/lib/encode/gif/`), quantizer `quantize` from gifenc 1.0.3 |
| Tests | Vitest 5 (unit), Playwright 1.64 driving branded Google Chrome (E2E, smoke, stress, benchmark), ffmpeg/ffprobe |
| CI/CD | GitHub Actions: `ci.yml` (check + E2E, manual stress), `release.yml` (draft release on `v*.*.*` tags) |
| Hosting | nginx 1.18 (Ubuntu), HTTP/2, HTTPS with HSTS, recommended CSP from `docs/SELF_HOSTING.md` |

## 3. Main modules

| Module | Responsibility |
| --- | --- |
| `src/lib/edit/` | `EditParams`, normalization (idempotent, shared UI/worker gate), crop geometry, output size, GIF/MP4 frame plans |
| `src/lib/media/` | Probe (real demux + first-frame decode), error classification, `FrameScaler` |
| `src/lib/encode/` | `exportClip` → `exportGif` (palette → mapping → differencing → writer) / `exportMp4` |
| `src/lib/jobs/` | Typed worker protocol, `runTask` lifecycle |
| `src/lib/capabilities.ts` (new) | Required-API list and detection, used on the page and in the worker |
| `src/lib/site.ts` (new) | Product name, public URL, build identity |
| `src/hooks/` | Source loading, export job state + result object URLs, preview playback, capabilities |
| `src/components/` | Home, editor (preview + crop overlay, timeline, settings, export bar), result |

## 4. Core data flow

1. File chosen/dropped → `useSourceLoader.load` → size check → worker `probe` (container, codec, display size with rotation, duration, first decoded frame) → object URL for the `<video>` preview.
2. `defaultParams` (Balanced preset) → every UI edit goes through `normalizeParams` + `detectPreset`.
3. Export → `checkLimits` in the UI → snapshot posted to a new worker → re-normalized and re-checked → pipeline → bytes transferred back (zero-copy) → `Blob` + object URL → result screen.
4. Results are keyed by the edit; changing the edit revokes stale result URLs; replacing the file revokes everything.

## 5. GIF export flow

1. `planGifFrames`: output frames at the chosen fps; delays from rounded cumulative boundaries (no drift); delays < 2 cs folded into the previous frame (browsers treat them as 10 cs).
2. Palette pass: 12 frames sampled across the clip → PnnQuant (`gifenc`) → one global palette of up to 255 colors; one extra slot is reserved for transparency.
3. Encode pass: `CanvasSink.canvasesAtTimestamps` → `FrameScaler` (crop + halving downscale, `imageSmoothingQuality: "high"`) → `getImageData` → `PaletteMapper` (cached per 7-bit color, optional Bayer dithering only for poorly represented colors) → `GifAnimator` (identical frames merged; changed bounding box only; unchanged pixels = transparent index; disposal 1) → `GifWriter` (GIF89a, NETSCAPE loop block, own LZW).

**Encoder review.** Checked against the GIF89a spec: header/version, Logical Screen Descriptor
(global table flag, color resolution, table size, background 0, aspect 0), power-of-two Global
Color Table padded with black, Graphic Control Extension (disposal 1, transparency flag and
index, delay), Image Descriptor without local table or interlace, LZW minimum code size ≥ 2,
code-size growth and clear at 4096 (matches the reference encoder), 255-byte sub-blocks and
terminator, NETSCAPE2.0 loop (absent for "play once", `N − 1` otherwise), trailer `0x3B`. No
local color tables are used (by design). The transparent index is never produced by the mapper,
and the first frame is a full opaque frame, so "disposal 1 + transparent unchanged pixels" cannot
leave holes. Verified: unit tests decode every frame with an independent decoder; E2E and
smoke tests now also decode every frame in Chrome and check that the last composited frame has
zero transparent pixels. New complex-motion tests (overlapping sprites, A → B → A reverts,
objects leaving the frame) fail when the previous-frame bookkeeping is broken (mutation check:
3/3 new tests failed with `prev[...] = v` removed) and pass on the real code.

## 6. MP4 export flow

`planVideoFrames` (constant frame rate, holds as repeated frames, exact total duration) →
`canEncodeVideo("avc", {width, height, bitrate, frameRate})` with the real configuration →
`FrameScaler` → Mediabunny `CanvasSource` (H.264, key frame every 2 s) → `Mp4OutputFormat`
(fast start, in memory). No audio track is ever added. On error the output is cancelled.

## 7. Web Worker lifecycle

- One worker per task (probe, capability check, export); `settle()` terminates it exactly once on result, error, `onerror`, `onmessageerror` or cancel.
- Starting a new export or loading a new file cancels the previous task; stale callbacks are ignored (`taskRef.current !== task`).
- Unmounting the hooks cancels the task; page unload ends workers with the document.
- **Verified:** after probe, GIF export, MP4 export, two cancellations and four further exports, `page.workers()` was 0 every time (smoke test, local and production); a worker exists during export and is gone within 1 s of *Cancel* (E2E H, smoke).

## 8. Memory management

| Resource | Handling | Status |
| --- | --- | --- |
| `VideoFrame` | Created and closed inside Mediabunny's `CanvasSink`; the app never holds frames | OK (by design) |
| `ImageBitmap` | Not used | n/a |
| Canvases | `CanvasSink` pool of 2; `FrameScaler.dispose()` shrinks scratch/output canvases to 1×1 in `finally` | OK |
| Mediabunny `Input` / `Output` | `input.dispose()` in `finally`; `output.cancel()` on MP4 errors | OK |
| Source file | `BlobSource`, read lazily in chunks (2 GB limit) | OK |
| Result bytes | Transferred (not copied) to the page; one `Blob` per result | OK |
| Object URLs | Revoked when replaced, when the edit changes, on file replace and on unmount (E2E I checks only live URLs remain) | OK |
| Worker heap | Freed by `terminate()` (also on cancel) | OK |
| `AbortController` | Not used; cancellation is `worker.terminate()`, which stops all work immediately | OK (stronger than abort) |

Measured main-thread JS heap across repeated exports and cancels: 4.2 → 5.1 MB (no growth
trend). Worker peak memory: **N/A** (not measurable from the page without cross-origin
isolation). Large buffers by design: 12 RGBA palette samples (≤ 69 MB at 1600×900), mapper
cache 6 MB, LZW tables 6 MB.

## 9. Browser compatibility

Required: secure context, module `Worker`, `VideoDecoder`, `EncodedVideoChunk`, `VideoFrame`,
`OffscreenCanvas` + 2D; MP4 additionally H.264 `VideoEncoder` (checked with the real
configuration). Verified in Chrome 155 on macOS and in Chrome on Linux CI; everything else is
not tested. Full matrix: [BROWSER_COMPATIBILITY.md](../BROWSER_COMPATIBILITY.md).

## 10. Automated test coverage

| Suite | v0.1.0 | v0.1.1 |
| --- | --- | --- |
| Unit (Vitest) | 57 | 69 |
| E2E (`npm run e2e`) | 54 | 69 |
| Smoke (`npm run e2e:smoke`, new) | — | 46 |
| Stress | 8 | 8 |
| Benchmark (new) | — | `npm run bench` |

Results: [TEST_REPORT_V1.md](TEST_REPORT_V1.md).

## 11. GitHub release workflow

`release.yml` builds on a `v*.*.*` tag (or manual dispatch), checks tag = `package.json`
version, runs type check/lint/unit/build, zips `out/` + SHA-256, extracts notes from
`CHANGELOG.md` and creates a **draft** release. v0.1.0 was published on 2026-10-13 with
`screenbloom-v0.1.0-static.zip` (376 688 B) and its `.sha256`. Findings: the notes included an
HTML comment, didn't say the zip is a website (not an installer), and `CHANGELOG.md` still
listed 0.1.0 as "Unreleased" (see P2-5, P2-8).

## 12. Deployment and static assets

- `https://screenbloom.storyweave.cloud/`: HTTP 200 over HTTP/2, valid certificate; `http://` → 301 to HTTPS.
- Headers match `docs/SELF_HOSTING.md`: CSP (`connect-src 'self' blob:`), `nosniff`, `no-referrer`, `Permissions-Policy`, HSTS.
- All `/_next/static/` assets referenced by the page return 200 with correct MIME types (`application/javascript`, `text/css`); `favicon.ico`, `LICENSE.txt` 200.
- `robots.txt`, `sitemap.xml`, `og-image.png` 404 (the app didn't generate them — P2-3). `THIRD_PARTY_NOTICES.md` is served as `application/octet-stream`, so browsers download it instead of showing it (P2-9).
- **Which version is deployed:** production had no version marker. Its `index.html` is byte-identical (SHA-256 `4639d533…`) to a local build of tag `v0.1.0`, with identical asset hashes, and `Last-Modified` is 2026-10-13 13:31 GMT, so production = v0.1.0 code. v0.1.1 adds `version.json` and a footer so this no longer needs inference (P2-4).
- No hydration errors, console errors, failed requests or cross-origin requests on production during the full smoke flow.

## 13. Security and privacy

- **Verified on production:** during import, preview, GIF + MP4 export, cancels and language switching, every request was a same-origin `GET`; nothing was sent anywhere. No analytics, fonts or CDNs.
- CSP `connect-src 'self' blob:` prevents exfiltration even if a script were injected. `script-src 'unsafe-inline'` is required by Next.js static export; the app renders no untrusted HTML (file names are React text), and the only inline scripts are Next's bootstrap and the static JSON-LD.
- Build identity exposes only version, public commit SHA and build time — no environment variables.
- Dependencies: `npm audit --omit=dev` = 0 vulnerabilities. Full `npm audit` = 5 high, all in dev-only lint tooling (`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces` ≤ 3.0.3, a ReDoS-style stack exhaustion). No fixed `braces` exists; npm's suggested "fix" is a downgrade to `eslint-config-next@14`, which is wrong for Next 16 (P3-1).
- Licenses: unchanged since the v0.1.0 audit (`THIRD_PARTY_NOTICES.md`): MIT project; shipped MPL-2.0 Mediabunny (unmodified, notice shipped); no GPL/AGPL. No dependency was added in v0.1.1.
- Security reporting: GitHub private vulnerability reporting is **disabled** (`{"enabled": false}`) although `SECURITY.md` and the issue chooser pointed to it (P1-4).

## 14. Performance bottlenecks

Benchmark (1080p 10 s → 800 px 15 fps GIF, median of 5): the largest stage was crop/scale/readback
(745 ms of 1616 ms) because `willReadFrequently: true` forced a CPU canvas — fixed (P1-1). The
remaining time is split between palette mapping + LZW (~4 ms/frame) and the palette pass. 5K
inputs are dominated by decoding. Possible future work (P3): `ByteWriter.bytes()` copies byte
by byte; palette sampling could reuse the encode pass. Details: [PERFORMANCE.md](../PERFORMANCE.md).

## 15. Documentation consistency

| Document | Problem | Fixed |
| --- | --- | --- |
| README (en/zh) | "a demo GIF is not included yet"; no link to the live site; test results pointed to the pre-release report | Yes |
| `docs/BROWSER_SUPPORT.md` | Linux CI listed as "results pending" although CI E2E passed (52/52 + 1 skip) | Yes → `BROWSER_COMPATIBILITY.md` |
| `docs/ARCHITECTURE.md` | Titled "录屏转 GIF"; said the static HTML renders in Chinese; capability check described as `VideoDecoder`/`OffscreenCanvas` only; test counts 57/54 | Yes |
| `docs/OPEN_SOURCE_RELEASE_REPORT.md`, `OPEN_SOURCE_AUDIT.md` | Pre-publication state ("not a Git repository", CI never run) | Moved to `docs/audits/V0.1.0_*` with a "historical" note |
| `CHANGELOG.md` | 0.1.0 "Unreleased" after release; no compare links | Yes |
| `SECURITY.md`, issue `config.yml` | Pointed reporters to a disabled channel | Yes (maintainer action still open) |
| `config.ts` comment | Refers to README "Verified limits" section (now "Local processing limits") | Left as is (comment only) |

---

## Issues

Each entry: description · impact · reproduction · root cause · fix · verification · **status**.

### P0 — blocks normal use, data safety, or severe functional errors

None found. All functional checks pass on production (import, preview, trim, crop, width, fps,
GIF, download, MP4, cancel, repeated exports, language switch, phone layout), and no data leaves
the browser.

### P1 — important compatibility, performance or stability

**P1-1 GIF scaling ran in software.**
Impact: every GIF export, ~46 % of export time in the benchmark. Repro: `npm run bench` on v0.1.0 code → processing 745 ms of 1616 ms. Root cause: `FrameScaler` requested `willReadFrequently: true` for GIF, which makes Chrome use a CPU-backed canvas, so crop + resampling ran in software. Fix: keep the canvas GPU-accelerated (no hint), one readback per frame (`src/lib/media/frames.ts`). Verification: benchmark −26 % total (1616 → 1204 ms), processing −49 %; quality vs. Lanczos reference unchanged (SSIM 0.9630 → 0.9633, PSNR 34.95 → 35.01 dB); unit/E2E/smoke pass; stress unchanged or faster. **Fixed.**

**P1-2 CI actions ran on the deprecated Node 20 runtime.**
Impact: every CI and release run; GitHub forces Node 24 today and will remove Node 20. Repro: CI log warning "Node.js 20 is deprecated… actions/checkout@v4, actions/setup-node@v4". Root cause: v4 actions. Fix: `checkout@v5`, `setup-node@v5` (Node 24), `upload-artifact@v6` (v5 still targets Node 20). Verification: runtimes read from each action's `action.yml`; YAML parses. Runs on GitHub after push. **Fixed (unverified on GitHub until pushed).**

**P1-3 Incomplete, generic capability detection.**
Impact: browsers with partial WebCodecs/OffscreenCanvas support. Repro (run on production with Playwright): removing `window.VideoFrame` from the page → no warning, file picker enabled (v0.1.1: specific message, picker disabled). By code inspection, a browser that really lacks `VideoFrame`/`EncodedVideoChunk` or a 2D `OffscreenCanvas` would pass both v0.1.0 checks and fail inside the worker with an unspecific error; a missing `VideoDecoder` produced only a generic "lacks WebCodecs / OffscreenCanvas". Root cause: the page checked 3 APIs and the worker 2; the 2D context was not checked; the message did not name the API. Fix: `src/lib/capabilities.ts` (`Worker`, `VideoDecoder`, `EncodedVideoChunk`, `VideoFrame`, `OffscreenCanvas` + 2D), used on the page and in the worker; message lists missing APIs; MP4-unavailable text says GIF still works. Verification: 4 unit tests; E2E L (message names "VideoDecoder, VideoFrame", picker disabled); production vs. local comparison above. **Fixed.**

**P1-4 Security reports pointed to a disabled channel.**
Impact: vulnerability reporters. Repro: `gh api repos/JasonWu0080/ScreenBloom/private-vulnerability-reporting` → `{"enabled":false}`, while `SECURITY.md` and the issue chooser linked to it. Root cause: setting not enabled after publishing. Fix: e-mail documented as primary channel; GitHub channel described as "if the button is shown"; chooser links to `SECURITY.md`. Verification: docs review. **Partially fixed** — enabling the setting is a maintainer action.

### P2 — experience, documentation, engineering quality

**P2-1 Wrong product name in the app.** Title/header "录屏转 GIF" / "Screen to GIF" (also close to the existing ScreenToGif project) while the repo, domain and README say ScreenBloom. Fix: "ScreenBloom" + localized title; logo in header. Verified: E2E M, smoke. **Fixed.**

**P2-2 Default Next.js favicon.** The tab showed the Next.js "N". Fix: `src/app/icon.svg` + generated `favicon.ico` (16/32/48) from the same mark. **Fixed.**

**P2-3 No search/share metadata.** No canonical, Open Graph, Twitter card, robots, sitemap or structured data; static HTML in Chinese with a Chinese-only title. Fix: metadata in `layout.tsx` (English title/description, canonical, OG/Twitter with `public/og-image.png` 1200×630 built from a real screenshot), `robots.ts`, `sitemap.ts`, factual SoftwareApplication JSON-LD; static HTML in English (language still applied after load); configurable `SITE_URL`. hreflang deliberately not added (one URL serves both languages, see P3-5). Verified: E2E M, smoke, build output check in CI. **Fixed in code; live after deployment.**

**P2-4 Deployed version not identifiable.** Fix: build-time `version.json` + footer (version, commit, `-dirty` marker, build time); CI and release workflow assert it matches `package.json`/tag/HEAD. **Fixed; live after deployment.**

**P2-5 Changelog/release notes drift.** 0.1.0 still "Unreleased"; release body contained `<!-- … -->`. Fix: dated 0.1.0, compare links; extraction skips comments and link lines (run locally for v0.1.0 and v0.1.1). **Fixed.**

**P2-6 Documentation out of date after launch.** See section 15. **Fixed.**

**P2-7 Issue/PR templates.** Bug template lacked separate browser version, video format, resolution, duration, expected/actual and an explicit privacy confirmation; PR template lacked summary/changes/screenshots/breaking changes. **Fixed.**

**P2-8 Release zip could be mistaken for an app.** Fix: release notes now state it is a static website build for self-hosting, not a desktop installer, and how to verify the checksum. **Fixed (applies from v0.1.1).**

**P2-9 Production serves `.md` as `application/octet-stream`.** `THIRD_PARTY_NOTICES.md` downloads instead of displaying. Root cause: nginx `mime.types` has no `md`. Fix: documented in `SELF_HOSTING.md`; server config is outside the repository. **Open — maintainer action.**

**P2-10 Test gaps.** No full-frame decode of exported GIFs in a browser, no worker-lifecycle assertions, no complex-motion ghosting tests, no UI test for missing APIs, no runnable check of the live site, no benchmark. **Fixed** (see section 10).

### P3 — future improvements

| ID | Item | Recommendation |
| --- | --- | --- |
| P3-1 | Dev-only `npm audit` highs (`braces` via `eslint-config-next`) | Accept; watch for a patched `braces`/`fast-glob`; do not downgrade `eslint-config-next` |
| P3-2 | Outdated: `mediabunny` 1.61.4 (patch), `eslint` 10, `typescript` 7, `@types/node` 26 (majors) | Take the Mediabunny patch in a normal PR with the E2E suite; plan majors separately |
| P3-3 | Untested browsers and real devices | Run the manual checklist in Edge/Safari/Firefox, Android, iOS; consider Playwright Firefox/WebKit builds (download required) |
| P3-4 | Worker peak memory unknown | Measure with Chrome DevTools memory tooling on large exports |
| P3-5 | Chinese content not indexed separately | If Chinese search matters, add a `/zh/` route with hreflang/canonical pairs (routing change, not done in a maintenance release) |
| P3-6 | Actions referenced by tag; no Dependabot | Pin actions to SHAs and add Dependabot for Actions and npm |
| P3-7 | CI installs and builds twice (check job, E2E job) | Acceptable (~1 min); could pass `out/` as an artifact |
| P3-8 | Brief English → Chinese switch after load for Chinese visitors | Inherent to one static URL for both languages |
| P3-9 | No pre-export size estimate | Kept honest: size is shown after export; presets describe trade-offs. Only add a number if a reliable estimator exists |
| P3-10 | `ByteWriter.bytes()` copies byte by byte | Minor encode-time gain with `set()` on the block buffer |
| P3-11 | No warning before closing the tab during an export | Consider a `beforeunload` prompt while an export is running |
