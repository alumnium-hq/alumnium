#!/usr/bin/env node

import { spawn } from "node:child_process";
import { cliBinPath } from "./cliClient.ts";

main();

async function main() {
  const binPath = await cliBinPath();

  const child = spawn(binPath, process.argv.slice(2), {
    stdio: "inherit",
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
