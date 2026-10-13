# Open Source Audit

Audit of ScreenBloom v0.1.0 before its first public release. Date: 2026-10-13.
Scope: all source, configuration, tests, scripts, documentation, dependencies and build output.

## Actual architecture

The code matches the layered design in [ARCHITECTURE.md](ARCHITECTURE.md):

```
components/  ──► hooks/ (useSourceLoader, useExportJob, usePlayback, useCapabilities)
     │                └─► lib/jobs/worker-client ──postMessage──► workers/media.worker.ts
     └─► lib/edit/ (pure domain)                                    ├─► lib/media/ (probe, frames, errors)
                                                                    ├─► lib/encode/ (export, gif/)
                                                                    └─► lib/edit/ (same functions)
```

Verified dependency rules:

- `lib/edit/` imports only `lib/config` and itself — no React, Next.js, DOM or Mediabunny.
- `mediabunny` and `gifenc` are imported only from `lib/media/` and `lib/encode/`, which only the worker imports. They are not in the main page bundle.
- Components never create workers or touch WebCodecs; workers are created only in `lib/jobs/worker-client.ts`, and their lifecycle is owned by the hooks.
- The worker holds no UI state; one worker per job, terminated on success, failure, cancel and unmount.
- Worker messages use a single discriminated-union protocol (`lib/jobs/protocol.ts`) with no `any`.

## Differences between documentation and code

| Documentation said | Code did | Resolution |
| --- | --- | --- |
| The worker receives a normalized parameter snapshot, and invalid values cannot reach the encoders | The UI normalized parameters, but the worker trusted the snapshot as-is; `normalizeParams` also did not check enum fields or non-finite crop values | Worker now re-runs `normalizeParams` + `checkLimits`; enums and `NaN`/`Infinity` are corrected (with tests) |
| Errors show a category "+ retry button" | Every error was labeled "Retry", including ones a retry cannot fix (`mp4_unsupported`, `unsupported_codec`, …) | `isRetryable()` in the protocol; only `failed` and `resources` are labeled as retry |
| Build output ≈ 1.4 MB | ≈ 1.3 MB | Docs updated |
| Sub-path deployment: edit `basePath` in `next.config.ts` | Untested | `BASE_PATH` build variable added and tested end to end |
| 32 unit / 53 e2e / 8 stress tests | Matched | Now 57 / 54 / 8 |

## Technical debt found

| Issue | Severity | Status |
| --- | --- | --- |
| Mediabunny's MPL-2.0 header is stripped by minification; the build carried no license notices | High (compliance) | Fixed: `postbuild` copies `LICENSE` and `THIRD_PARTY_NOTICES.md` into `out/` |
| No `LICENSE`, no license field in `package.json` | High | Fixed (MIT) |
| Worker did not validate export parameters | Medium | Fixed |
| E2E suite crashed if the macOS-only HEVC sample was missing, so it could not run in Linux CI | Medium | Fixed: the HEVC case is skipped with a message when the sample is absent |
| No automated privacy check of network behavior | Medium | Added: E2E fails on any cross-origin or non-GET request |
| 8 unused i18n keys (16 strings) | Low | Removed |
| `/certificates/` (local HTTPS keys from `next dev --experimental-https`) not ignored | Low | Added to `.gitignore` |
| `docs/ARCHITECTURE.md` is Chinese-only while the README is English-first | Low | Open — translate when convenient |
| `useExportJob` revokes object URLs inside a `setResults` updater; React Strict Mode may run the updater twice (double revoke is harmless) | Low | Kept; behavior is correct |
| `Button` `danger` variant and `Notice` `danger` tone are unused | Low | Kept (small UI primitives) |
| A source map (`*.js.map`) for a third-party chunk is emitted into `out/` | Info | Kept; it contains no project secrets |

Searched for and **not** found: unused modules, components or hooks; duplicate parameter
validation or timeline math (UI and worker share `lib/edit/`); old worker protocols; unused
or obsolete encoders; dead config; unused dependencies; debug logging in `src/`; TODO/FIXME
markers. Every file under `src/` is reachable from `app/page.tsx` or the worker entry, and
every dependency is used.

## Deleted code

- 8 unused message keys in `src/lib/i18n/messages.ts`: `tryAnother`, `sourceInfo`, `duration`, `dimensions`, `fileSize`, `frameRate`, `previewSpeedNote`, `timeInputHint` (both languages). Checked against direct use and the dynamic `t(\`prefix_${x}\`)` patterns; the type checker confirms no references.
- The hard-coded MP4 quality list in `SettingsPanel` (now uses the shared `MP4_QUALITIES`).

## Core design kept unchanged

- `EditParams` as the single edit model; snapshot sent to the worker at export time.
- Pure domain layer shared by UI and worker (output size, frame counts, durations shown = encoded).
- One job, one worker; cancel = `worker.terminate()`; stale-callback guards by task identity.
- GIF pipeline: global PnnQuant palette, cached weighted-distance mapping, Bayer 8×8 dithering on poorly represented colors only, identical-frame merging, bounding-box differencing with transparency, own GIF89a writer and LZW with generation-stamped dictionary, exact centisecond delays, NETSCAPE loop semantics. **Not rewritten.**
- MP4 pipeline: WebCodecs H.264 via Mediabunny, CFR, holds as repeated frames, backpressure via awaited `source.add()`, `output.cancel()` on failure, video track only.
- Real progress only where a ratio is known; stage + elapsed time otherwise.
- Local processing limits in `src/lib/config.ts`.

## Dependency license risks

Full details: [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

| Risk | Assessment | Recommendation |
| --- | --- | --- |
| **Mediabunny (MPL-2.0)** is bundled into the site | File-level copyleft; compatible with MIT for the project's own code. Requires notice + telling recipients where the source is. Used unmodified. | Done: notices shipped with every build. If Mediabunny files are ever modified, publish those files under MPL-2.0. |
| **gifenc's quantizer** is described by gifenc as a port of PnnQuant.js, whose repository is currently labeled MPL-2.0, while gifenc is published as MIT | Provenance of the ported revision's license was not verified | Treated like MPL-2.0 code (unmodified, source location stated). Maintainers may ask upstream to clarify. |
| `@img/sharp-libvips-*` (LGPL-3.0) | Optional native binaries installed with Next.js; not used by static export and not in `out/` | None |
| `lightningcss`, `axe-core` (MPL-2.0), `caniuse-lite` (CC-BY-4.0) | Build/lint-time only | None |
| Unknown licenses | None found in `package-lock.json` | — |
| GPL/AGPL | None found | — |

## Browser compatibility risks

- Only macOS desktop Chrome 155 is verified by automated tests. Edge (same engine) is very likely to behave the same but is untested.
- Safari and Firefox ship WebCodecs, but decoder/encoder coverage (notably H.264 encoding and HEVC decoding) differs by version and OS; the MP4 option is disabled automatically when encoding is unavailable.
- Mobile browsers have far less memory; the limits were measured on a desktop.
- Linux headless Chrome in CI relies on Chrome's software H.264 decoder/encoder; the CI E2E job is configured but has not run yet.

See [BROWSER_SUPPORT.md](BROWSER_SUPPORT.md).

## Privacy and security

- No secrets, tokens, keys, `.env` files, private hosts, personal paths or e-mail addresses were found in the files that would be committed. Lockfile packages all resolve from `registry.npmjs.org`.
- The directory is **not a Git repository**, so there is no history to audit. Run a secret scanner (e.g. gitleaks) once the repository is initialized, and on any older copy of the code that has history.
- Runtime network behavior: source code has no `fetch`/XHR/beacon/WebSocket; the build output contains URLs only as string constants (error-doc links, spec links). Verified by the E2E privacy check.
- Recommended CSP with `connect-src 'self'` documented and exercised by every E2E run ([SELF_HOSTING.md](SELF_HOSTING.md)). COOP/COEP are intentionally not required.
- Next.js CLI telemetry (build-time, on developer machines) is disabled in CI via `NEXT_TELEMETRY_DISABLED`; it does not affect the deployed site.

## Recommended follow-ups

1. Run the GitHub Actions E2E job once and fix any Linux-specific differences.
2. Verify Edge, Safari, Firefox and at least one mobile browser with the manual checklist.
3. Add a demo GIF to the README (made with the tool itself).
4. Translate `docs/ARCHITECTURE.md` to English (keep the Chinese version).
5. Pin GitHub Actions to commit SHAs and enable Dependabot for `npm` and `github-actions`.
6. Test real device recordings (iPhone/Android screen recordings, HDR, long VFR captures).
