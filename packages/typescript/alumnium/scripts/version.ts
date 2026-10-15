#!/usr/bin/env bun

// This script outputs the current version of the TypeScript packages, or sets
// it on all of them with `set <version>` (they're released together).

import fs from "node:fs/promises";
import path from "node:path";
import { ALUMNIUM_VERSION } from "../../core/src/package.ts";

const [command, version] = process.argv.slice(2);

if (command === "set") {
  if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    console.error(`Usage: version.ts set <version>, got: ${version}`);
    process.exit(1);
  }

  const workspaceDir = path.resolve(import.meta.dirname, "../..");
  const packageJsonPaths = [
    path.join(workspaceDir, "package.json"),
    ...(
      await Array.fromAsync(
        new Bun.Glob("*/package.json").scan({ cwd: workspaceDir }),
      )
    )
      .filter((relPath) => !relPath.startsWith("node_modules/"))
      .map((relPath) => path.join(workspaceDir, relPath)),
  ];

  await Promise.all(
    packageJsonPaths.map(async (packageJsonPath) => {
      const text = await fs.readFile(packageJsonPath, "utf-8");
      // Replace in place to keep the formatting.
      const updated = text.replace(
        /^(\s*"version":\s*")[^"]+(")/m,
        `$1${version}$2`,
      );
      if (updated !== text) await fs.writeFile(packageJsonPath, updated);
    }),
  );

  console.log(
    `Set version ${version} in ${packageJsonPaths.length} package.json files`,
  );
} else {
  process.stdout.write(ALUMNIUM_VERSION);
}
