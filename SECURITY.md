# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities in public issues, discussions or pull requests.**

Report them privately by e-mail to **1156872601@qq.com** with a subject starting with
`[ScreenBloom security]`. This is the primary channel and always works.

If the repository's *Security* tab shows a **"Report a vulnerability"** button, you can use
GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
instead; it keeps the report and the fix discussion private on GitHub.

> Maintainers: as of 2026-10-14 private vulnerability reporting is **not enabled**. Turn it on
> under *Settings → Code security → Private vulnerability reporting* to offer the second channel.

Please include what is affected, steps or a proof of concept, and the impact you expect. Do not include other people's private recordings.

## What to expect

- We aim to acknowledge reports within 7 days and to agree on a fix and disclosure timeline with you.
- Fixes are released as a new version and described in `CHANGELOG.md` and a GitHub Security Advisory; reporters are credited unless they prefer otherwise.
- Please give us reasonable time to fix the issue before disclosing it publicly.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest release (0.1.x) | Yes |
| Older releases | No — please upgrade |

## Scope and security model

ScreenBloom is a static web app. All processing happens in the visitor's browser; there is no server-side component that stores or handles videos.

Relevant reports include, for example:

- anything that makes video data, frames, file names or other user data leave the browser;
- script injection or other ways to run code in the app's origin;
- malformed media files that cause behavior beyond a handled error (crashes of the tab are usually browser bugs, but tell us if the app makes them reachable);
- problems in the recommended deployment configuration (`docs/SELF_HOSTING.md`).

Vulnerabilities in browsers or in third-party packages should be reported to those projects; let us know as well if ScreenBloom needs to update or work around them.
