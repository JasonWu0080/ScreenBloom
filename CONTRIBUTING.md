# Contributing to ScreenBloom

Thanks for helping! This project is small on purpose. Please keep these principles in mind:

- **Local-first and private.** Video never leaves the browser. No uploads, backend, accounts, analytics or third-party requests.
- **Worker-first.** Decoding and encoding run in the Dedicated Worker; the UI never calls encoders or WebCodecs directly.
- **Capability-first.** Decide support by testing the browser's real capabilities, never by browser name.
- **Lightweight and simple.** Avoid new dependencies and abstractions unless they clearly pay for themselves.

Planned and out-of-scope work is listed in [docs/ROADMAP.md](docs/ROADMAP.md). For larger changes, open an issue first.

## Development environment

- Node.js 24 LTS (minimum 22.12; `.nvmrc` pins the major version) and npm.
- A desktop Chromium-based browser for running the app.
- For end-to-end tests: Google Chrome and `ffmpeg`/`ffprobe` on `PATH`, plus `npx playwright install ffmpeg`.

```bash
npm ci
```

```bash
npm run dev
```

Open <http://localhost:3000> (not a LAN IP — WebCodecs requires a secure context).

## Running checks

```bash
npm run check
```

That is type check + ESLint + unit tests. Before opening a PR that touches media processing or UI flows, also run:

```bash
npm run samples && npm run build && npm run e2e
```

`npm run samples` records a synthetic web page with Chrome and transcodes it with ffmpeg; the HEVC sample needs macOS (VideoToolbox) and is skipped elsewhere. E2E outputs and screenshots go to `test-results/`.

## Code style

- TypeScript strict mode; ESLint (`eslint-config-next`) must pass with no warnings.
- Match the surrounding code: small modules, plain functions, comments that explain *why*.
- Domain logic in `src/lib/edit/` stays pure — no React, Next.js, DOM or Mediabunny imports — so it runs in both the UI and the worker and is unit-testable.
- Worker messages go through the typed protocol in `src/lib/jobs/protocol.ts`; don't add parallel message channels.
- Every user-facing string needs both Chinese and English entries in `src/lib/i18n/messages.ts` (the type system enforces matching keys).
- Release every resource you create: object URLs, workers, Mediabunny inputs/outputs, canvases. Prefer `try … finally`.

## Issues

Use the issue templates. For bugs, include the browser + version, OS/device, the source video's container/codec/resolution (shown in the editor), and any error text with its technical details. **Don't attach recordings with private content** — issues are public.

## Pull requests

1. Fork and create a branch from `main`.
2. Keep the change focused; one topic per PR.
3. Add or update tests (see below) and docs; add a line under `## [Unreleased]` in `CHANGELOG.md` for user-visible changes.
4. Make sure `npm run check` and `npm run build` pass. CI also runs the end-to-end suite in Chrome.
5. Fill in the PR template checklist.

By submitting a contribution you agree that it is licensed under the project's [MIT License](LICENSE).

### Tests for new features

- New or changed rules for parameters, crop, output size or timing → unit tests in `tests/unit/`.
- New UI flows or export behavior → an end-to-end check in `tests/e2e/run.mjs` that verifies the *downloaded file* (ffprobe / GIF parser), not just the UI.
- New limits → keep `src/lib/config.ts` as the single source, and back the value with a measurement (document it in `docs/PERFORMANCE.md`).

### Changing the GIF encoder

The GIF encoder (`src/lib/encode/gif/`) is the core of the project. Changes must:

- keep output valid GIF89a, verified by the independent decoder in `tests/unit/gif-decoder.ts` (don't change the decoder to match the encoder);
- keep the pixel-level regression suite in `tests/unit/gif-pipeline.test.ts` passing — decoded frames must equal the mapped input frames exactly, and total delay must be preserved;
- preserve exact centisecond timing and the loop-count semantics (0 = forever, N plays → NETSCAPE value N − 1, "play once" writes no loop block);
- keep the global palette and position-based dithering (no per-frame palettes, no error diffusion), which are what make frame differencing effective and prevent flicker;
- include before/after numbers (file size, encode time, same input and settings) in the PR for anything that affects output or speed.

See [docs/GIF_ENCODER.md](docs/GIF_ENCODER.md) for how it works.

### Browser compatibility

If a change touches decoding, encoding, workers or canvas code, say in the PR which browsers you tested in. Use the manual checklist in [docs/BROWSER_SUPPORT.md](docs/BROWSER_SUPPORT.md). Only update the support matrix with results you actually observed.
