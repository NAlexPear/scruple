#!/usr/bin/env node

import { runCli } from "./index.js";

try {
  process.exitCode = await runCli();
} catch (error) {
  process.stderr.write(`scruple: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
