# Third-Party Notices

ScreenBloom's own source code is licensed under the [MIT License](LICENSE). The production
build (`out/`) also contains code from the third-party packages below, which remain under
their own licenses. `npm run build` copies this file and `LICENSE` into `out/`, so every
deployment carries these notices.

Audited against `package-lock.json` on 2026-10-13. Versions are the ones locked at that time.

## Shipped in the static site

| Package | Version | License | Copyright / source |
| --- | --- | --- | --- |
| [mediabunny](https://github.com/Vanilagy/mediabunny) | 1.61.3 | **MPL-2.0** | Copyright (c) 2026-present, Vanilagy and contributors |
| [gifenc](https://github.com/mattdesl/gifenc) (`quantize` only) | 1.0.3 | MIT (see note) | Copyright (c) 2017 Matt DesLauriers |
| [next](https://github.com/vercel/next.js) (client runtime) | 16.4.0 | MIT | Copyright (c) 2025 Vercel, Inc. |
| [react](https://github.com/facebook/react), react-dom, scheduler | 19.3.0 / 19.3.0 / 0.28.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [core-js](https://github.com/zloirock/core-js) (legacy-browser polyfills bundled by Next.js) | 3.38.1 | MIT | Denis Pushkarev and contributors — see <https://github.com/zloirock/core-js/blob/v3.38.1/LICENSE> |
| [@swc/helpers](https://github.com/swc-project/swc) (compiler helpers, may be inlined) | 0.5.23 | Apache-2.0 | SWC project — see `node_modules/@swc/helpers/LICENSE` |

### Mediabunny (MPL-2.0)

Mediabunny is used **unmodified**. MPL-2.0 is a file-level copyleft license: it does not
affect the license of ScreenBloom's own files, but recipients of the bundled (executable)
form must be told where to get the source code of the MPL-covered files.

- Source code of the exact version used: <https://www.npmjs.com/package/mediabunny/v/1.61.3>
  and <https://github.com/Vanilagy/mediabunny>
- License text: <https://mozilla.org/MPL/2.0/>

If you modify Mediabunny's files, your modified versions of those files must be made
available under MPL-2.0.

### gifenc and PnnQuant.js

gifenc is published under MIT. Its README states that its color quantizer is "based on a port
of PnnQuant.js" (<https://github.com/mcychan/PnnQuant.js>). At the time of this audit the
PnnQuant.js repository is labelled MPL-2.0; the license of the revision gifenc ported from
was not verified. Because this project already meets MPL-2.0 notice and source-availability
obligations for Mediabunny, the same treatment is applied here: gifenc is used unmodified and
its source is available at <https://www.npmjs.com/package/gifenc/v/1.0.3>.

### Full license texts

- MIT: <https://opensource.org/license/mit>
- MPL-2.0: <https://mozilla.org/MPL/2.0/>
- Apache-2.0: <https://www.apache.org/licenses/LICENSE-2.0>

Each package's own license file is included in its npm tarball (`node_modules/<package>/`).

## Build and development tools only (not shipped)

These run on the developer's machine or in CI and are not part of the deployed site.

| License | Packages (examples) |
| --- | --- |
| MIT / ISC / BSD / 0BSD | TypeScript tooling, ESLint plugins, Vitest, Tailwind CSS, PostCSS, etc. |
| Apache-2.0 | `typescript`, `playwright`, `playwright-core`, `@eslint/*`, `sharp` (optional, unused by static export) |
| MPL-2.0 | `lightningcss` (CSS compiler used by Tailwind CSS), `axe-core` (lint rule data) |
| LGPL-3.0-or-later | `@img/sharp-libvips-*` — optional native binaries of `sharp`, installed by Next.js for image optimization. This project does not use `next/image` optimization and nothing from them is in `out/`. |
| CC-BY-4.0 | `caniuse-lite` (browser support data used at build time) |
| BlueOak-1.0.0, Python-2.0, CC0-1.0 | `minimatch`, `argparse`, `language-subtag-registry` |

No package with an unknown license, and no GPL/AGPL package, was found in the lockfile.
