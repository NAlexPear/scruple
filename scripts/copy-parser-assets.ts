import { copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

for (const name of readdirSync("src")) {
  if (name.endsWith(".wasm") || name.endsWith(".LICENSE")) {
    copyFileSync(join("src", name), join("dist", name));
  }
}
