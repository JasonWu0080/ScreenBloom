// Runs after `next build` (npm "postbuild"). Minification strips license comments from the
// bundles, so the license and third-party notices are shipped as files next to the site.
import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const [from, to] of [
  ["LICENSE", "LICENSE.txt"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
]) {
  copyFileSync(path.join(root, from), path.join(root, "out", to));
}
