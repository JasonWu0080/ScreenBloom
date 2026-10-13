// Runs after `next build` (npm "postbuild"). Minification strips license comments from the
// bundles, so the license and third-party notices are shipped as files next to the site.
// version.json lets anyone check which commit a deployment was built from.
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_INFO_FILE } from "./build-info.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "out");
for (const [from, to] of [
  ["LICENSE", "LICENSE.txt"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
]) {
  copyFileSync(path.join(root, from), path.join(out, to));
}
if (existsSync(BUILD_INFO_FILE)) copyFileSync(BUILD_INFO_FILE, path.join(out, "version.json"));
