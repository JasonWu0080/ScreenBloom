# Self-hosting

ScreenBloom builds to a plain static site. There is no server code, database or environment
secret, and no specific cloud provider is required.

## 1. Build

```bash
npm ci
```

```bash
npm run build
```

The site is written to `out/` (about 1.4 MB). It includes `LICENSE.txt` and
`THIRD_PARTY_NOTICES.md`; keep them when you deploy — the bundled Mediabunny code is MPL-2.0
and its notice must travel with it.

### Build-time settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `SITE_URL` | `https://screenbloom.storyweave.cloud` | Public URL of your copy (including any sub-path). Used for the canonical link, Open Graph / Twitter image URLs, `robots.txt` and `sitemap.xml`. **Set it when you host your own copy**, otherwise those point to the official site. |
| `BASE_PATH` | none | Sub-path deployment, see below. |
| `SOURCE_DATE_EPOCH` | current time | Fixed build time (seconds) for reproducible builds. |

```bash
SITE_URL=https://gif.example.com npm run build
```

### Which version is deployed?

Every build contains `version.json` (also shown at the bottom of the home page):

```json
{ "name": "ScreenBloom", "version": "0.1.1", "commit": "<full Git SHA>", "buildTime": "<ISO time>" }
```

A commit ending in `-dirty` means the build was made from a working tree with uncommitted
changes. Check a deployment with `curl https://<your-site>/version.json`.

Tagged releases also provide a ready-made `screenbloom-vX.Y.Z-static.zip` on the GitHub
Releases page once maintainers publish them.

To check the build locally with the recommended headers:

```bash
npm start
```

## 2. Deploy

Upload the **contents** of `out/` to any static web server, object storage bucket or CDN.

Requirements:

- **HTTPS.** Browsers only expose WebCodecs in secure contexts. Over plain HTTP (except
  `localhost`) the page loads but explains that video processing is unavailable.
- **JavaScript MIME type for `.js`** (`text/javascript` or `application/javascript`). The
  worker is a module script under `/_next/static/chunks/`; a wrong MIME type, or an HTML
  fallback page served instead of a missing `.js` file, makes every export fail with
  "processing module failed to load".
- **No special cross-origin headers.** No `SharedArrayBuffer` or multi-threaded WASM is used,
  so COOP/COEP are not needed.
- `index.html` at the root; `404.html` can be used as the not-found page.
- `robots.txt`, `sitemap.xml` and `og-image.png` are plain files at the root; serve `.xml` as
  XML and `.png` as an image. Serving `.md` as `text/markdown; charset=utf-8` (Nginx: add
  `text/markdown md;` to `types`) lets browsers display `THIRD_PARTY_NOTICES.md` instead of
  downloading it.

The worker bundle (~500 KB, ~130 KB gzipped) is only downloaded when a user opens a file.
Files under `/_next/static/` have content hashes in their names and can be cached for a long
time (`Cache-Control: public, max-age=31536000, immutable`).

## 3. Sub-path deployment

To serve the app under a path such as `https://example.com/tools/gif/`, set `BASE_PATH` at
build time (it is compiled into the bundles):

```bash
BASE_PATH=/tools/gif npm run build
```

Then upload `out/` so that `out/index.html` is served at `/tools/gif/`. This configuration
was tested end to end (open file → export GIF) with no failed requests.

## 4. Recommended security headers

All of these except `Strict-Transport-Security` (which only makes sense over HTTPS) are what
`npm start` sends, and the end-to-end tests run against them, so they are known to work with
the worker, WebCodecs and blob previews:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self'; connect-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000
```

Notes:

- `connect-src 'self'` means the page cannot send data to any other origin, which backs up the
  "no uploads" promise at the browser level.
- `script-src 'unsafe-inline'` is needed for the inline bootstrap scripts that Next.js static
  export writes into the HTML. External scripts are still blocked.
- `blob:` is needed for the source video preview and the exported result.
- Add `Strict-Transport-Security` only once HTTPS works for the whole domain.
- Browser recording (planned for v0.2) will need `display-capture` to stay allowed — don't add
  `display-capture=()` to `Permissions-Policy`.

### Nginx example

```nginx
server {
    listen 443 ssl;
    server_name gif.example.com;
    root /var/www/screenbloom;   # contents of out/

    include mime.types;          # .js → application/javascript

    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self'; connect-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    location /_next/static/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        # add_header in a location replaces the server-level ones, so repeat the essentials:
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri.html $uri/ =404;
    }

    error_page 404 /404.html;
}
```

(The Nginx example is a starting point and has not been run by the project's test suite; the
headers themselves have.)

## Docker

The project does not ship a Docker image: any static file server container (for example the
official `nginx` image with the configuration above and `out/` copied into it) is sufficient.
