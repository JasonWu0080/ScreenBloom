# Test Report V1 — v0.1.1

Date: 2026-10-14. Code: v0.1.1 working tree on top of `2440364` (tag `v0.1.0`), not yet
committed — builds therefore report the commit as `2440364…-dirty`.

## Environment

| | |
| --- | --- |
| Machine | Apple M4, 16 GB RAM, macOS 15.6 (24G84) |
| Node.js / npm | 25.6.1 / 11.9.0 (project targets Node 24 LTS, ≥ 22.12; Node 24 itself not run locally — CI uses it via `.nvmrc`) |
| Browser | Google Chrome 155.0.8059.40 via Playwright 1.64 (headless) |
| Tools | ffmpeg / ffprobe 8.0.1 |
| Test inputs | Synthetic recordings from `npm run samples` (+ `--stress`, + benchmark clip); no private material |

## Results

| Command | Result | Pass | Fail | Skip | Notes |
| --- | --- | --- | --- | --- | --- |
| `npm ci` | **PASS** | | | | Clean install from the lockfile |
| `npm run typecheck` | **PASS** | | | | |
| `npm run lint` | **PASS** | | | | 0 errors, 0 warnings |
| `npm test` (Vitest) | **PASS** | 69 | 0 | 0 | 7 files (v0.1.0: 57) |
| `npm run build` | **PASS** | | | | Routes `/`, `/robots.txt`, `/sitemap.xml`, `/icon.svg`; `out/version.json`, notices, `og-image.png` present |
| `npm run e2e` | **PASS** | 69 | 0 | 0 | Incl. HEVC (macOS only). v0.1.0: 54 |
| `npm run e2e:smoke` (local build) | **PASS** | 46 | 0 | 0 | New suite |
| `E2E_BASE_URL=https://screenbloom.storyweave.cloud npm run e2e:smoke` | **FAIL (expected)** | 36 | 10 | 0 | Production still runs v0.1.0. All 36 functional checks pass; the 10 failures are v0.1.1 features not deployed yet (title, canonical, OG, Twitter, JSON-LD, version footer, `/robots.txt`, `/sitemap.xml`, `/og-image.png`, `/version.json`) |
| `npm run e2e:stress` (2 runs) | **PASS** | 8 | 0 | 0 | Both runs; timings in [PERFORMANCE.md](../PERFORMANCE.md) |
| `npm run bench` | **PASS** (informational) | | | | Median of 5 after warm-up: 1204 ms total, 1322 ms wall, 1.72 MB |
| Release-notes extraction (`release.yml` step run locally, `TAG=v0.1.0` and `v0.1.1`) | **PASS** | | | | Output in [`docs/releases/v0.1.1.md`](../releases/v0.1.1.md) |
| Workflow / issue-template YAML parse | **PASS** | | | | |
| Markdown relative-link check (all `*.md`) | **PASS** | | | | 0 broken after fixes |
| GitHub Actions on the v0.1.1 changes | **NOT TESTED** | | | | Nothing pushed (by instruction) |

Stress and benchmark ran on the final export pipeline; afterwards only UI wording and docs
changed, and `check`, `build`, `e2e` and `smoke` were re-run on the final code.

### Mutation check

The three new frame-differencing tests were run against a deliberately broken
`GifAnimator` (previous-frame update removed): all 3 failed (7 of 12 pipeline tests failed in
total); the file was restored and the suite passes.

### What the new checks cover

- **GIF validity** beyond the header: every frame decoded by Chrome's `ImageDecoder` (frame count, size, total duration within 10 ms) and zero transparent pixels in the last composited frame; independent block parser for delays and loop count; independent LZW decoder in unit tests.
- **Cancel and repeated exports** (smoke): a worker exists during export; 0 workers within 1 s of cancel; 0 workers after every export; GIF → MP4 → cancel → GIF ×3 with changed settings → cancel → GIF all succeed; only the current source/result blob URLs referenced; main-thread JS heap 4.2 → 5.1 MB.
- **Unsupported browser**: `VideoDecoder`/`VideoFrame` removed → the message names both APIs and the picker is disabled.
- **SEO/identity**: title, canonical, `og:image`, Twitter card, JSON-LD (no ratings), `robots.txt`, `sitemap.xml`, `og-image.png`, `version.json` matching `package.json`.
- **Privacy**: every request during the flows is a same-origin `GET` (local and production).

## Production check (2026-10-14, v0.1.0 deployment)

| Check | Result |
| --- | --- |
| HTTPS / HTTP/2 / redirect from HTTP | PASS |
| Security headers (CSP, nosniff, referrer, permissions, HSTS) | PASS |
| Static assets referenced by the page | PASS (all 200, correct MIME) |
| Console errors / hydration errors / 4xx–5xx during the flow | PASS (none) |
| Cross-origin or non-GET requests | PASS (none) |
| Import, preview, trim, crop (1:1), width, fps, GIF export + download + full decode | PASS |
| MP4 export (H.264, no audio) | PASS |
| Cancel (worker terminated), repeated exports, cancel again, export again | PASS |
| Language switch zh ↔ en | PASS |
| 375 px viewport (Chrome emulation) | PASS |
| Title / SEO / version / robots / sitemap / OG image | FAIL — not in v0.1.0; fixed in v0.1.1, pending deployment |
| Production commit | Inferred: `index.html` byte-identical to a local build of `v0.1.0` (no version marker existed) |

## Known issues

- `THIRD_PARTY_NOTICES.md` is served as `application/octet-stream` by the production nginx (downloads instead of displaying). Server configuration, documented in `SELF_HOSTING.md`.
- `npm audit`: 5 high-severity advisories in dev-only lint tooling (`braces` via `eslint-config-next`), no fixed version available; `npm audit --omit=dev`: 0.

## Not verified

| Item | Why |
| --- | --- |
| Desktop Chromium (Playwright build), Firefox, WebKit | Not installed; installing needs a download that wasn't requested |
| Edge, Safari, real Android/iOS devices, Windows | Not available / not automated (Safari needs *Allow Remote Automation*) |
| Mobile browsers | Only Chrome device emulation at 375 px — not a mobile browser |
| GitHub Actions run of these changes, release workflow end to end | Not pushed or tagged (by instruction) |
| Production with v0.1.1 | Not deployed (by instruction); re-run `E2E_BASE_URL=https://screenbloom.storyweave.cloud npm run e2e:smoke` after deploying — expected 46/46 |
| Worker peak memory | Not measurable from the page without cross-origin isolation |
| Node.js 24 locally | Local machine has Node 25.6.1; CI uses Node 24 |
| Self-hosting under `BASE_PATH`, served end to end | Only the generated URLs were checked: `BASE_PATH=/tools/gif SITE_URL=https://example.com/tools/gif npm run build` gives correct canonical, `og:image`, icon, chunk, `robots.txt` and `sitemap.xml` URLs. Serving and exporting under the sub-path was verified for v0.1.0 only |
