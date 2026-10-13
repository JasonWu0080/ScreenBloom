# Contributing to ScreenBloom

Thanks for helping! This project is small on purpose. Please keep these principles in mind:

- **Local-first and private.** Video never leaves the browser. No uploads, backend, accounts, analytics or third-party requests.
- **Worker-first.** Decoding and encoding run in the Dedicated Worker; the UI never calls encoders or WebCodecs directly.
- **Capability-first.** Decide support by testing the browser's real capabilities, never by browser name.
- **Lightweight and simple.** Avoid new dependencies and abstractions unless they clearly pay for themselves.

Planned and out-of-scope work is listed in [docs/ROADMAP.md](docs/ROADMAP.md). For larger changes, open an issue first.

## Development environment

- Node.js 24 LTS (minimum 22.12, see `engines` in `package.json`; `.nvmrc` pins the major version, so `nvm use` picks it) and npm.
- A desktop Chromium-based browser for running the app.
- For end-to-end tests: Google Chrome and `ffmpeg`/`ffprobe` on `PATH`, plus `npx playwright install ffmpeg`.

```bash
git clone https://github.com/JasonWu0080/ScreenBloom.git && cd ScreenBloom
```

```bash
npm ci
```

```bash
npm run dev
```

Open <http://localhost:3000> (not a LAN IP — WebCodecs requires a secure context).

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run typecheck` / `npm run lint` / `npm test` | TypeScript, ESLint, Vitest unit tests |
| `npm run check` | All three above |
| `npm run build` | Static export to `out/` (+ notices and `version.json`) |
| `npm start` | Serve `out/` locally with the recommended security headers |
| `npm run samples` | Synthetic test videos into `samples/` (Chrome + ffmpeg) |
| `npm run e2e` | End-to-end suite against `out/` in Chrome |
| `npm run e2e:smoke` | Critical-path smoke test (`E2E_BASE_URL=…` for a deployment) |
| `npm run e2e:stress` | Large inputs and limits (`node scripts/make-samples.mjs --stress` first) |
| `npm run bench` | GIF export benchmark |

## Running checks

```bash
npm run check
```

That is type check + ESLint + unit tests. Before opening a PR that touches media processing or UI flows, also run:

```bash
npm run samples && npm run build && npm run e2e && npm run e2e:smoke
```

`npm run samples` records a synthetic web page with Chrome and transcodes it with ffmpeg; the HEVC sample needs macOS (VideoToolbox) and is skipped elsewhere. E2E outputs and screenshots go to `test-results/`.

## Code style

- TypeScript strict mode; ESLint (`eslint-config-next`) must pass with no warnings.
- Match the surrounding code: small modules, plain functions, comments that explain *why*.
- Domain logic in `src/lib/edit/` stays pure — no React, Next.js, DOM or Mediabunny imports — so it runs in both the UI and the worker and is unit-testable.
- Worker messages go through the typed protocol in `src/lib/jobs/protocol.ts`; don't add parallel message channels.
- Every user-facing string needs both Chinese and English entries in `src/lib/i18n/messages.ts` (the type system enforces matching keys).
- Release every resource you create: object URLs, workers, Mediabunny inputs/outputs, canvases. Prefer `try … finally`.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) style, as the history does:
`type(scope): summary` in the imperative, e.g. `fix(gif): keep transparency index out of the palette`,
`test(e2e): …`, `docs: …`, `ci: …`. Common types: `feat`, `fix`, `perf`, `refactor`, `test`,
`docs`, `ci`, `chore`. Explain the *why* in the body when it isn't obvious.

## Reporting bugs

Use the issue templates. For bugs, include the browser + version, OS/device, the source video's container/codec/resolution/duration (shown in the editor), the ScreenBloom version (bottom of the home page), and any error text with its technical details. **Don't attach recordings with private content** — issues are public. Security problems go through [SECURITY.md](SECURITY.md), never a public issue.

## Pull requests

1. Fork and create a branch from `main`.
2. Keep the change focused; one topic per PR.
3. Add or update tests (see below) and docs; add a line under `## [Unreleased]` in `CHANGELOG.md` for user-visible changes.
4. Make sure `npm run check` and `npm run build` pass. CI also runs the end-to-end and smoke suites in Chrome.
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
- include before/after numbers in the PR for anything that affects output or speed: run `npm run bench` on both versions on the same machine (`BENCH_BASELINE=… npm run bench` compares them).

See [docs/GIF_ENCODER.md](docs/GIF_ENCODER.md) for how it works.

### Browser compatibility

If a change touches decoding, encoding, workers or canvas code, say in the PR which browsers you tested in. Use the manual checklist in [docs/BROWSER_COMPATIBILITY.md](docs/BROWSER_COMPATIBILITY.md). Only update the support matrix with results you actually observed.

### README assets

`docs/assets/screenbloom-demo.gif`, `docs/assets/screenbloom-preview.png`, `public/og-image.png`
and `src/app/favicon.ico` are generated from the real app. After visible UI changes, regenerate
them (needs samples, Chrome and ffmpeg):

```bash
npm run build && node scripts/make-assets.mjs && npm run build
```

## Releases (maintainers)

1. Move `## [Unreleased]` entries in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` heading and add its compare link at the bottom.
2. Set the same version in `package.json` (`npm version X.Y.Z --no-git-tag-version`); the app shows it from there.
3. Commit, push, wait for CI, then tag `vX.Y.Z` and push the tag. The release workflow checks that the tag, `package.json` and the built `version.json` agree and creates a **draft** release with the static site zip and its checksum.
4. Review the draft and publish it. Deploying the site is a separate, manual step; afterwards `https://<site>/version.json` shows the deployed commit.
