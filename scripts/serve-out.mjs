// Tiny static server for the exported site in ./out (used by `npm start` and the e2e checks).
// Any static host works in production. It sends the security headers recommended in
// docs/SELF_HOSTING.md, so every e2e run proves they are compatible with the app.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".txt": "text/plain", ".map": "application/json", ".woff2": "font/woff2", ".md": "text/markdown; charset=utf-8", ".png": "image/png", ".xml": "application/xml" };
// 'unsafe-inline' scripts are required by the inline bootstrap scripts of Next.js static export.
// connect-src stays 'self': the page cannot send data (or video) to any other origin.
export const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "connect-src 'self' blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

export function serve(port = 4173) {
  const server = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(root, p);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    } catch {
      file = file + ".html";
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { ...SECURITY_HEADERS, "content-type": types[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4173);
  await serve(port);
  console.log(`Serving out/ at http://127.0.0.1:${port}`);
}
