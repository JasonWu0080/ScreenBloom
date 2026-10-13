# GIF Encoder

How ScreenBloom turns decoded video frames into a GIF, and why it is built this way. The
encoder targets **screen recordings**: large static areas, flat UI colors, small text, a
moving cursor, scrolling, and occasional gradients.

Source: [`src/lib/encode/export.ts`](../src/lib/encode/export.ts) (pipeline) and
[`src/lib/encode/gif/`](../src/lib/encode/gif/) (palette, frame differencing, writer, LZW).

## Who implements what

| Part | Implemented by |
| --- | --- |
| Demuxing, decoding, rotation | Browser **WebCodecs** `VideoDecoder`, driven by **Mediabunny** (`CanvasSink`) — third party (MPL-2.0) |
| Crop and downscale | Browser `OffscreenCanvas` 2D (`drawImage`, `imageSmoothingQuality = "high"`), orchestrated by this project (`FrameScaler`) |
| Frame timing plan | This project (`src/lib/edit/timeline.ts`) |
| Color quantization (palette) | **gifenc**'s `quantize` (a port of PnnQuant.js) — third party (MIT; see [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md)) |
| Palette mapping, dithering | This project (`PaletteMapper`) |
| Frame merging and differencing | This project (`GifAnimator`) |
| GIF89a container and LZW compression | This project (`GifWriter`, `LzwEncoder`) |

gifenc's own encoder is **not** used: it cannot write sub-rectangle frames with offsets, and
its millisecond-based delays don't give exact centisecond control.

## Pipeline

```
planGifFrames ─► pass 1: 12 sample frames ─► global palette (PnnQuant, ≤255 colors)
              ─► pass 2: every frame: decode → crop/scale → RGBA
                     ─► PaletteMapper (cached nearest color, optional ordered dither)
                     ─► GifAnimator (merge identical frames, bounding box of changes, transparency)
                     ─► GifWriter (GIF89a blocks) ─► LzwEncoder ─► Uint8Array (image/gif)
```

Frames are requested from the decoder at monotonically increasing timestamps, so each packet
is decoded at most once. If a variable-frame-rate file has no frame for a timestamp, the
previous frame is reused so the timeline never shifts.

## GIF89a output

Each file contains:

1. Header `GIF89a` and logical screen descriptor (output width × height).
2. **Global color table** — the palette plus one extra slot reserved for transparency, padded
   to the next power of two (minimum 2 entries).
3. **NETSCAPE2.0 application extension** for looping (see *Loop semantics*), unless the GIF plays once.
4. Per written frame: a **Graphic Control Extension** (disposal method 1 "do not dispose",
   transparency flag + index, delay in centiseconds), an **Image Descriptor** (position and
   size of the frame's sub-rectangle; no local color table, not interlaced), and LZW-compressed
   image data in ≤255-byte sub-blocks.
5. Trailer `0x3B`.

## Global palette and color quantization

One palette is used for the whole animation, built from **12 frames sampled evenly across
the clip** (at most ~2 million pixels, sub-sampled with a stride if needed). gifenc's
PnnQuant (pairwise nearest neighbor clustering) runs in `rgb565` mode and produces up to
`colors − 1` entries; the last slot is the transparent index.

Why one global palette: per-frame palettes make the same UI color change index from frame
to frame. That causes visible flicker and, just as importantly, defeats frame differencing —
a pixel whose index changed must be re-encoded even if it looks the same.

## Color mapping

`PaletteMapper` maps each pixel to the nearest palette entry using a weighted distance that
tracks perceived brightness better than plain RGB distance:

```
d = 2·ΔR² + 4·ΔG² + 3·ΔB²
```

Results are cached for the whole job in a table keyed by 7 bits per channel (2²¹ entries).
That makes mapping fast and guarantees that the same color always maps to the same index in
every frame (temporal stability).

## Dithering

Optional (on by default in the HD preset). It is **ordered dithering with an 8×8 Bayer
matrix**, applied only to colors the palette represents poorly (weighted error above a
threshold) — gradients and photos. Colors that are close to a palette entry, such as flat UI
backgrounds and text, are never dithered.

Ordered dithering depends only on pixel position, so a static area produces identical
indices in every frame. Error-diffusion dithering (Floyd–Steinberg) would spread changes from
moving content into static regions and make them "shimmer", which also breaks frame
differencing.

## Frame differencing

`GifAnimator` compares each mapped frame with the previous one:

- **Identical frame** → nothing is written; its delay is added to the previous frame.
  Pauses in a recording cost almost nothing, and total duration is unchanged.
- **Changed frame** → only the **bounding box** of changed pixels is written. Inside that box,
  pixels that did not change are set to the **transparent index**, which compresses very well.
- The first frame is written in full and opaque.

Every frame uses disposal method 1, so each frame is drawn on top of the previous canvas.
This is safe because the encoder tracks the exact canvas state a decoder will have.

## LZW compression

`LzwEncoder` implements GIF's variable-length-code LZW:

- minimum code size = max(2, palette bits); clear code `2^n`, end-of-information `2^n + 1`;
- code width grows from `n + 1` up to 12 bits ("early change" as decoders expect);
- when the dictionary reaches 4096 codes, a clear code is emitted and the dictionary restarts;
- the dictionary is a flat table indexed by `(prefix << 8) | next` with **generation stamps**,
  so a reset is O(1) instead of clearing a 1M-entry table — important for large noisy frames
  that reset often;
- output is packed LSB-first and split into data sub-blocks of at most 255 bytes.

## Timing precision

GIF delays are integers in centiseconds (1/100 s). Output time `t` maps to source time
`start + t × speed`. `planGifFrames` computes each frame's **end time**, rounds that boundary
to centiseconds, and takes the difference to the previous boundary. Rounding errors therefore
never accumulate: 15 fps gives 7, 7, 6, 7, 7, 6 … cs, and the sum always equals the requested
duration (e.g. 60 s at 15 fps is exactly 6000 cs over 900 frames).

- The first-frame hold is added to the first delay, the last-frame hold to the last delay.
- Browsers treat delays below 2 cs as 10 cs, so a tiny trailing remainder is folded into the
  previous frame and every delay is at least 2 cs.
- Delays above the 16-bit maximum (655.35 s) are split by appending a 1×1 transparent frame.

## Loop semantics

| Setting | Written | Meaning |
| --- | --- | --- |
| Loop forever | NETSCAPE loop count `0` | Repeat indefinitely |
| Play once | No NETSCAPE block | Play once and stop on the last frame |
| Play N times (N ≥ 2) | NETSCAPE loop count `N − 1` | The count is the number of *repeats after the first play* |

Chrome's own `ImageDecoder` is used in the end-to-end tests to confirm it reads the value
this way. Some viewers (for example certain chat apps) ignore finite loop counts.

## Tests

- [`tests/unit/gif.test.ts`](../tests/unit/gif.test.ts) — header and color table, GCE/descriptor
  fields, transparency, disposal, minimum code size, loop counts, delay splitting, LZW round trips
  including many dictionary resets. Output is parsed by an independent decoder in
  [`tests/unit/gif-decoder.ts`](../tests/unit/gif-decoder.ts).
- [`tests/unit/gif-pipeline.test.ts`](../tests/unit/gif-pipeline.test.ts) — the full
  palette → mapping → differencing → writer pipeline on synthetic static UI, cursor movement,
  scrolling, gradients with dithering, text, noise, and long still sections. Every decoded frame
  must equal the mapped input exactly, the transparent slot must never be visible, and total
  delay must be preserved.
- [`tests/unit/timeline.test.ts`](../tests/unit/timeline.test.ts) — timing across frame rates,
  speeds and holds.
- `tests/e2e/run.mjs` — real exports in Chrome, checked with ffprobe, a GIF block parser and
  Chrome's `ImageDecoder`.
