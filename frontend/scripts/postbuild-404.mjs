// Render's static host serves a 404.html for unknown paths instead of rewriting every
// path to index.html, so a deep link such as /school/admin answered "Not Found" on
// refresh. Shipping a copy of the built app as 404.html means those paths load the
// same bundle and the client router renders the right screen.
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
const index = join(dist, "index.html");

if (!existsSync(index)) {
  console.error("postbuild-404: dist/index.html is missing, run vite build first");
  process.exit(1);
}

copyFileSync(index, join(dist, "404.html"));
console.log("postbuild-404: dist/404.html written from index.html");
