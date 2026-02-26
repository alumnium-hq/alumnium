#!/usr/bin/env bun

// This script builds the Alumnium for multiple target platforms using Bun.

import type { BunPlugin, Loader } from "bun";
import { $ } from "bun";

const TARGETS = [
  "linux-x64",
  "linux-arm64",
  "darwin-x64",
  "darwin-arm64",
  "windows-x64",
] as const;

const loggerPathPlugin: BunPlugin = {
  name: "logger-path-rewrite",
  setup(build) {
    build.onLoad({ filter: /\.ts$/, namespace: "file" }, async (args) => {
      const input = await Bun.file(args.path).text();

      if (!input.includes("getLogger(import.meta.path)")) {
        return;
      }

      return {
        ...args,
        // TODO: Replace the absolute path part so paths the same on different machines.
        contents: input.replaceAll(
          "getLogger(import.meta.path)",
          `getLogger(${JSON.stringify(args.path)})`,
        ),
      };
    });
  },
};

await $`rm -rf dist`;
await $`mkdir -p dist`;

await Promise.all(
  TARGETS.map(async (target) => {
    console.log(`Building for target: ${target}`);

    const result = await Bun.build({
      entrypoints: ["./src/cli.ts"],
      compile: {
        target: `bun-${target}`,
        outfile: `dist/alumnium-${target}`,
      },
      plugins: [loggerPathPlugin],
    });

    if (!result.success) {
      throw new AggregateError(
        result.logs.map((log) => new Error(log.message)),
        `Failed to build for target: ${target}`,
      );
    }
  }),
);

function getLoader(path: string): Loader {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts") || path.endsWith(".mts") || path.endsWith(".cts"))
    return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  return "js";
}
