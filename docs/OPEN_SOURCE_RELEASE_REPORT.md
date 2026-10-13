# Open Source Release Report — v0.1.0

Date: 2026-10-13

## Verdict: Ready with Known Limitations

The code, tests, licensing and documentation are in a releasable state. A few items need a
maintainer decision or action before the repository is made public (listed at the end).

## Code changes

| File | Change |
| --- | --- |
| `src/lib/edit/params.ts` | `normalizeParams` also corrects enum fields (`format`, `aspect`, `preset`, `mp4Quality`, `gifDither`); exported `OUTPUT_FORMATS`, `MP4_QUALITIES` |
| `src/lib/edit/crop.ts` | `clampRect` treats non-finite values as the full frame instead of producing `NaN` crops |
| `src/workers/media.worker.ts` | Re-validates the export snapshot with `normalizeParams` + `checkLimits` before encoding |
| `src/lib/jobs/protocol.ts` | `isRetryable(code)` — only `failed` and `resources` are retryable |
| `src/components/editor/ExportBar.tsx` | "Retry" label only for retryable errors |
| `src/components/editor/SettingsPanel.tsx` | Uses shared `MP4_QUALITIES` |
| `src/lib/i18n/messages.ts` | Removed 8 unused keys (both languages) |
| `next.config.ts` | Optional `BASE_PATH` build variable for sub-path hosting |
| `scripts/serve-out.mjs` | Sends the recommended security headers (CSP, nosniff, referrer and permissions policy); serves `.md` |
| `scripts/copy-notices.mjs` (new) | `postbuild`: copies `LICENSE` and `THIRD_PARTY_NOTICES.md` into `out/` |
| `package.json` / `package-lock.json` | `license: MIT`, description, keywords, `engines`, `postbuild` and `check` scripts; still `private: true` |
| `.gitignore` | Cleaned up; ignores `/certificates/` |

No user-facing feature was removed. The GIF encoder, MP4 pipeline, worker model and UI are unchanged apart from the items above.

## Tests

| Test | Before | After |
| --- | --- | --- |
| Unit (Vitest) | 32 in 4 files | **57 in 6 files** |
| E2E checks (Playwright + Chrome) | 53 | **54** (+ privacy check; HEVC case skips on non-macOS) |
| Stress / limits | 8 | 8 |

New tests:

- `tests/unit/gif-decoder.ts` — the independent GIF decoder, moved out of `gif.test.ts` and extended (header flags, image descriptor, min code size).
- `tests/unit/gif.test.ts` — +6: global color table size and padding, first frame opaque / later frames disposal 1 + transparency + bounding box, minimum LZW code size 2, loop count encoding, delay splitting above 65535 cs, 512×512 noise round trip with many dictionary resets.
- `tests/unit/gif-pipeline.test.ts` (new, 9) — full palette → mapping → differencing → writer pipeline on synthetic static UI, cursor movement, scrolling, gradient + dithering, text, noise, long still section; plus mapper determinism and "exact colors are never dithered". A mutation check (disabling the previous-frame update in `GifAnimator`) made 4 of these tests fail, confirming they detect ghosting.
- `tests/unit/params.test.ts` — +3: idempotence over a sequence of UI edits, malformed snapshot correction, limits on the normalized snapshot.
- `tests/unit/timeline.test.ts` — +2: no timing drift across 9 frame rates × 6 speeds × holds; 60 s at 15 fps = exactly 6000 cs / 900 frames.
- `tests/unit/errors.test.ts` (new, 5) — error classification and retryability.
- `tests/e2e/run.mjs` — privacy check (only same-origin GET requests), skip support.

## Commands run and results

All on macOS 15.6, Apple M4, Node.js 25.6.1, Google Chrome 155.0.8059.40, ffmpeg 8.0.1.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (no warnings) |
| `npm test` | **57/57 pass** |
| `npm run build` | Pass; `out/LICENSE.txt` and `out/THIRD_PARTY_NOTICES.md` present |
| `npm run e2e` | **54/54 pass** (with the CSP and other security headers enforced) |
| `npm run e2e:stress` | **8/8 pass** |
| `BASE_PATH=/tools/gif npm run build` + scripted export under `/tools/gif/` | Pass (GIF exported, no 4xx/5xx) |
| Release-notes extraction (`awk` from `release.yml`) on `CHANGELOG.md` | Pass |
| YAML parse of workflows and issue templates | Pass |

The baseline before any change was also green (32 unit, 53 E2E).

## Not executed

- **GitHub Actions** (`ci.yml`, `release.yml`) — no remote repository; never run on GitHub. The Linux E2E job in particular is unproven (headless Chrome codecs on Linux, ffmpeg from apt).
- **Node.js 24 LTS** — the declared target; tests ran on Node 25.6.1.
- **Other browsers** — Edge, Safari, Firefox, Android Chrome, iOS Safari: not tested. Safari is installed on this machine but no automated or manual run was done.
- **Real device recordings**, HDR / 10-bit input, memory profiling.
- The Nginx example in `docs/SELF_HOSTING.md` (the headers in it were tested; the Nginx config itself was not).

## Browsers verified

Only **Google Chrome 155 on macOS 15.6 (Apple M4)**, through the automated suites. See [BROWSER_SUPPORT.md](BROWSER_SUPPORT.md).

## License status

- Project: **MIT** (`LICENSE`, `package.json`). Copyright holder: Nanjing Junhe E-Commerce Co., Ltd..
- Third-party: audited; notices in `THIRD_PARTY_NOTICES.md` and shipped in every build. Main obligation is Mediabunny's MPL-2.0 (unmodified; notice and source location provided). One open provenance question: gifenc's quantizer is a port of PnnQuant.js (currently MPL-2.0) while gifenc is MIT — handled conservatively, worth confirming upstream.
- No GPL/AGPL or unknown licenses.

## Security status

- No secrets or personal data in the files to be committed.
- Not a Git repository — **no history exists to audit**. If an older repository with history exists elsewhere, scan it before publishing that history.
- No runtime third-party requests; enforced by an E2E check. Recommended CSP documented and tested.

## Documentation added or updated

`LICENSE`, `THIRD_PARTY_NOTICES.md`, `README.md` (rewritten in English), `README.zh-CN.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md` (corrected), `docs/GIF_ENCODER.md`, `docs/BROWSER_SUPPORT.md`, `docs/PERFORMANCE.md` (measured numbers only), `docs/ROADMAP.md`, `docs/SELF_HOSTING.md`, `docs/OPEN_SOURCE_AUDIT.md`, this report; `.github/` workflows, issue templates and PR template.

## Maintainer action items before going public

1. ~~**Copyright holder**~~ — done: Nanjing Junhe E-Commerce Co., Ltd..
2. ~~**Contact**~~ — done: 1156872601@qq.com in `CODE_OF_CONDUCT.md` and `SECURITY.md`.
3. **Private vulnerability reporting** — optional second channel; enable it in the GitHub repository settings (security e-mail is already in `SECURITY.md`).
4. **Repository metadata** — add `repository`, `homepage`, `bugs` and `author` to `package.json` and version compare links to `CHANGELOG.md` once the URL is known.
5. **Project name** — the package and folder are "ScreenBloom", but the UI calls the app "Screen to GIF / 录屏转 GIF", which is close to the existing, well-known *ScreenToGif* application. Decide on one public name and check for trademark conflicts.
6. **Initialize Git** (`git init`), review `.claude/launch.json` and `AGENTS.md` (tool-specific files; keep or remove), then make the first commit.
7. **Run CI on GitHub** and fix anything Linux-specific in the E2E job.
8. **Demo GIF** for the README.
9. **Release** — set the date in `CHANGELOG.md` for 0.1.0, tag `v0.1.0`; the release workflow then creates a *draft* release for review.
10. Optional: verify more browsers, pin Actions to SHAs, add Dependabot, translate `ARCHITECTURE.md`.
