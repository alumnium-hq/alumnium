#!/usr/bin/env node

import { spawn } from "node:child_process";
import { cliBinPath } from "./cliClient.ts";

await main();

async function main() {
  const binPath = await cliBinPath();

  const child = spawn(binPath, process.argv.slice(2), {
    stdio: "inherit",
    // oxlint-disable-next-line no-process-env -- We need it to pass env vars
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
}
