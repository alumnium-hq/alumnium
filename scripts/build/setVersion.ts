#!/usr/bin/env bun

// Sets the release version in a package's files: `setVersion.ts <target>
// <version>`. Used by the `version/set` mise tasks; TypeScript packages use
// packages/typescript/scripts/version.ts.

import fs from "node:fs/promises";
import path from "node:path";

interface Replacement {
  /** Files relative to the repo root (globs allowed). */
  files: string[];
  /** Regexps whose first group precedes and second group follows the version. */
  patterns: RegExp[];
}

const REPO_ROOT_DIR = path.resolve(import.meta.dirname, "../..");

// Maven/Gradle coordinates and pom snippets of Alumnium artifacts.
const JAVA_SNIPPET_PATTERNS = [
  /(ai\.alumnium:alumnium[\w-]*:)[^'"\s]+()/g,
  /(<artifactId>alumnium[\w-]*<\/artifactId>\s*<version>)[^<]+(<\/version>)/g,
];

const TARGETS: Record<string, Replacement[]> = {
  python: [
    {
      files: ["packages/python/pyproject.toml"],
      patterns: [
        /^(version = ")[^"]+(")/m,
        // The CLI is released with the same version.
        /(alumnium-cli==)[^;\s"]+()/g,
      ],
    },
    {
      // Updated in place as `uv lock` can't resolve the new version before the
      // CLI pip packages are rebuilt.
      files: ["packages/python/uv.lock"],
      patterns: [
        /(\nname = "alumnium(?:-cli)?"\nversion = ")[^"]+(")/g,
        /(\{ name = "alumnium-cli", version = ")[^"]+(")/g,
      ],
    },
  ],
  java: [
    {
      files: ["packages/java/build.gradle"],
      patterns: [/^(version = ')[^']+(')/m],
    },
  ],
  docs: [
    {
      files: [
        "websites/docs/src/content/**/*.{md,mdx}",
        "websites/docs/src/copy/**/*.ts",
      ],
      patterns: JAVA_SNIPPET_PATTERNS,
    },
  ],
  chart: [
    {
      files: ["charts/alumnium/Chart.yaml"],
      patterns: [/^(appVersion: ")[^"]+(")/m],
    },
  ],
  readme: [
    {
      files: ["README.md"],
      patterns: JAVA_SNIPPET_PATTERNS,
    },
  ],
};

const [target, version] = process.argv.slice(2);
const replacements = target && TARGETS[target];

if (!replacements || !version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(
    `Usage: setVersion.ts <${Object.keys(TARGETS).join("|")}> <version>`,
  );
  process.exit(1);
}

let changed = 0;
for (const { files, patterns } of replacements) {
  const paths = (
    await Promise.all(
      files.map((pattern) =>
        Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: REPO_ROOT_DIR })),
      ),
    )
  ).flat();
  if (!paths.length) throw new Error(`No files match ${files.join(", ")}`);

  for (const relPath of paths) {
    const filePath = path.join(REPO_ROOT_DIR, relPath);
    const text = await fs.readFile(filePath, "utf-8");
    const updated = patterns.reduce(
      (acc, pattern) =>
        acc.replace(
          pattern,
          (_, before, after) => `${before}${version}${after}`,
        ),
      text,
    );
    if (updated === text) continue;
    await fs.writeFile(filePath, updated);
    changed++;
  }
}

console.log(`Set ${target} version ${version} in ${changed} files`);
