#!/usr/bin/env bun

// Sets the release version in a package's files: `setVersion.ts <target>
// <version>`. Used by the `version/set` mise tasks; TypeScript packages use
// packages/typescript/alumnium/scripts/version.ts. Accepts SemVer
// (`0.24.0-alpha.1`) or PEP 440 (`0.24.0a1`) versions; Python files get the
// PEP 440 form and the rest SemVer.

import fs from "node:fs/promises";
import path from "node:path";

interface Replacement {
  /** Files relative to the repo root (globs allowed). */
  files: string[];
  /** Regexps whose first group precedes and second group follows the version. */
  patterns: RegExp[];
  /** Converts the SemVer version to the files' format. */
  format?: (version: string) => string;
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
      format: toPep440,
    },
    {
      // Updated in place as `uv lock` can't resolve the new version before the
      // CLI pip packages are rebuilt.
      files: ["packages/python/uv.lock"],
      patterns: [
        /(\nname = "alumnium(?:-cli)?"\nversion = ")[^"]+(")/g,
        /(\{ name = "alumnium-cli", version = ")[^"]+(")/g,
      ],
      format: toPep440,
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

// Pre-release labels in SemVer and their PEP 440 counterparts.
const PRE_RELEASE_LABELS: Record<string, string> = {
  alpha: "a",
  beta: "b",
  rc: "rc",
};

/** Converts a PEP 440 pre-release (`0.24.0a1`) to SemVer (`0.24.0-alpha.1`). */
function toSemver(version: string): string {
  const match = version.match(/^(\d+\.\d+\.\d+)(a|b|rc)(\d+)$/);
  if (!match) return version;
  const [, release, label, number] = match;
  const semverLabel = Object.entries(PRE_RELEASE_LABELS).find(
    ([, pep440Label]) => pep440Label === label,
  )?.[0];
  return `${release}-${semverLabel}.${number}`;
}

/** Converts a SemVer pre-release (`0.24.0-alpha.1`) to PEP 440 (`0.24.0a1`). */
function toPep440(version: string): string {
  const match = version.match(/^(\d+\.\d+\.\d+)-(alpha|beta|rc)\.(\d+)$/);
  if (!match) return version;
  const [, release, label, number] = match;
  return `${release}${PRE_RELEASE_LABELS[label!]}${number}`;
}

const [target, versionArg] = process.argv.slice(2);
const replacements = target && TARGETS[target];
const version = versionArg && toSemver(versionArg);

if (!replacements || !version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(
    `Usage: setVersion.ts <${Object.keys(TARGETS).join("|")}> <version>`,
  );
  process.exit(1);
}

let changed = 0;
const fileVersions = new Set<string>();
for (const { files, patterns, format } of replacements) {
  const fileVersion = format ? format(version) : version;
  fileVersions.add(fileVersion);
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
          (_, before, after) => `${before}${fileVersion}${after}`,
        ),
      text,
    );
    if (updated === text) continue;
    await fs.writeFile(filePath, updated);
    changed++;
  }
}

console.log(
  `Set ${target} version ${[...fileVersions].join(", ")} in ${changed} files`,
);
