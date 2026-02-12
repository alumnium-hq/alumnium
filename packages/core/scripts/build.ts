#!/usr/bin/env bun

// This script builds the Alumnium for multiple target platforms using Bun.

import { $ } from "bun";

const targets = [
  "linux-x64",
  "linux-arm64",
  "darwin-x64",
  "darwin-arm64",
  "windows-x64",
];

await $`rm -rf dist`;
await $`mkdir -p dist`;

await Promise.all(
  targets.map(async (target) => {
    console.log(`Building for target: ${target}`);
    await $`bun build ./src/cli.ts --target bun-${target} --compile --outfile dist/alumnium-${target}`;
  }),
);
