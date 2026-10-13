## Summary

<!-- What does this change and why? One or two sentences. -->

## Related issue

<!-- "Fixes #123" / "Refs #123", or "none". -->

## Changes

-

## Testing

- [ ] `npm run check` (type check, lint, unit tests)
- [ ] `npm run build`
- [ ] `npm run e2e` and `npm run e2e:smoke` (need Chrome + ffmpeg; CI runs them too)
- [ ] `npm run bench` before/after numbers below (GIF encoder or pipeline changes only)
- [ ] Manually tested in: <!-- browser + version + OS -->

## Screenshots

<!-- For UI changes: before / after. Don't include private recordings. -->

## Breaking changes

<!-- "None", or what changes for users, self-hosters or contributors. -->

## Checklist

- [ ] No user video, frames, audio, file names or other data leave the browser; no new network requests or third-party services.
- [ ] Long-running work stays in the worker; UI code does not call encoders or WebCodecs directly.
- [ ] New dependencies (if any) are justified, and their licenses are compatible and listed in `THIRD_PARTY_NOTICES.md` if shipped.
- [ ] User-facing text is added in both Chinese and English (`src/lib/i18n/messages.ts`).
- [ ] GIF encoder changes: unit tests in `tests/unit/gif*.test.ts` pass and cover the change (see CONTRIBUTING.md).
- [ ] Docs and `CHANGELOG.md` (`[Unreleased]`) updated where relevant.
