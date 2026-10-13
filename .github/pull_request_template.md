## What and why

<!-- What does this change, and what problem does it solve? Link issues with "Fixes #123". -->

## How it was tested

- [ ] `npm run check` (type check, lint, unit tests)
- [ ] `npm run build`
- [ ] `npm run e2e` (needs Chrome + ffmpeg; CI runs it too)
- [ ] Manually in: <!-- browser + OS -->

## Checklist

- [ ] No user video, frames, file names or other data leave the browser; no new network requests or third-party services.
- [ ] Long-running work stays in the worker; UI code does not call encoders or WebCodecs directly.
- [ ] New dependencies (if any) are justified, and their licenses are compatible and listed in `THIRD_PARTY_NOTICES.md` if shipped.
- [ ] User-facing text is added in both Chinese and English (`src/lib/i18n/messages.ts`).
- [ ] GIF encoder changes: unit tests in `tests/unit/gif*.test.ts` pass and cover the change (see CONTRIBUTING.md).
- [ ] Docs and `CHANGELOG.md` (Unreleased) updated where relevant.
