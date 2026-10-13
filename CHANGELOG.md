# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - Unreleased

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

<!-- Add version compare links here once the repository URL is final. -->
