#!/usr/bin/env bun

// This script builds the Alumnium for multiple target platforms using Bun.

import type { BunPlugin } from "bun";
import { $ } from "bun";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { ALUMNIUM_VERSION } from "../src/package.js";

const OSES = ["linux", "darwin", "windows"] as const;

type OS = (typeof OSES)[number];

const ARCHS = ["x64", "arm64"] as const;

type Arch = (typeof ARCHS)[number];

interface TargetPackage {
  os: OS;
  arch: Arch;
  target: string;
  name: string;
  dir: string;
}

const CORE_PKG_ASSETS = ["../../README.md", "../../LICENSE.md"];

const REPO_ROOT_DIR = path.resolve(import.meta.dirname, "../../");
const DIST_DIR = path.resolve(import.meta.dirname, "../dist/");
const BIN_DIR = path.resolve(DIST_DIR, "bin");

const TARGET_PACKAGES: TargetPackage[] = OSES.flatMap((os) =>
  ARCHS.map((arch) => {
    const target = `${os}-${arch}`;
    return {
      os,
      arch,
      target,
      name: `@alumnium/cli-${target}`,
      dir: path.resolve(DIST_DIR, `alumnium-cli-${target}`),
    };
  }),
);

const loggerPathPlugin: BunPlugin = {
  name: "logger-path-rewrite",
  setup(build) {
    build.onLoad({ filter: /\.ts$/, namespace: "file" }, async (args) => {
      const input = await Bun.file(args.path).text();

      if (!input.includes("getLogger(import.meta.url)")) {
        return;
      }

      const relativePath = path.relative(REPO_ROOT_DIR, args.path);

      return {
        ...args,
        contents: input.replaceAll(
          "getLogger(import.meta.url)",
          `getLogger(${JSON.stringify(relativePath)})`,
        ),
      };
    });
  },
};

const seleniumRequireAtomRe = /requireAtom\('([^']+)'.+$/gm;

const depsPatcherPlugin: BunPlugin = {
  name: "deps-patcher",
  setup(build) {
    build.onLoad(
      { filter: /selenium-webdriver.+http\.js$/, namespace: "file" },
      async (args) => {
        const input = await Bun.file(args.path).text();
        return {
          ...args,
          contents: input.replace(
            seleniumRequireAtomRe,
            "require('./atoms/$1')",
          ),
        };
      },
    );
  },
};

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    bin: {
      type: "boolean",
      default: false,
      short: "b",
    },
  },
  allowPositionals: true,
});

const buildPackages = !values.bin;

if (buildPackages) {
  console.log(`Building Alumnium ${ALUMNIUM_VERSION} packages...`);
  await Promise.all(TARGET_PACKAGES.map(({ dir }) => $`rm -rf ${dir}`));
  await $`mkdir -p dist`;
} else {
  console.log(`Building Alumnium ${ALUMNIUM_VERSION} binaries...`);
  await $`rm -rf ${BIN_DIR}`;
  await $`mkdir -p ${BIN_DIR}`;
}

await Promise.all([
  (async () => {
    if (!buildPackages) return;

    await $`bun tsgo --project tsconfig.build.json`;

    const pkgDir = path.resolve(DIST_DIR, "alumnium");
    await Promise.all(
      CORE_PKG_ASSETS.map((assetPath) => $`cp ${assetPath} ${pkgDir}`),
    );

    const packageJsonPath = path.resolve(pkgDir, "package.json");
    const packageJsonStr = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonStr);
    packageJson.optionalDependencies = {};

    TARGET_PACKAGES.forEach(({ name }) => {
      packageJson.optionalDependencies[name] = ALUMNIUM_VERSION;
    });

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    console.log("✅ alumnium");
  })(),

  ...TARGET_PACKAGES.map(async ({ os, arch, target, name, dir }) => {
    const execExt = os === "windows" ? ".exe" : "";
    const npmExecName = `alumnium${execExt}`;

    const outfile = buildPackages
      ? path.join(dir, npmExecName)
      : path.resolve(
          BIN_DIR,
          `alumnium-${ALUMNIUM_VERSION}-${target}${execExt}`,
        );

    const result = await Bun.build({
      entrypoints: ["./src/cli.ts"],
      compile: {
        target: bunTarget(os, arch),
        outfile,
      },
      plugins: [loggerPathPlugin, depsPatcherPlugin],
    });

    if (buildPackages) {
      await fs.writeFile(
        path.join(dir, "package.json"),
        JSON.stringify(
          {
            name,
            version: ALUMNIUM_VERSION,
            description: `Alumnium CLI binary for ${target}`,
            repository: "https://github.com/alumnium-hq/alumnium",
            license: "MIT",
            os: [npmOs(os)],
            cpu: [arch],
            bin: { alumnium: `./${npmExecName}` },
          },
          null,
          2,
        ),
      );
    }
    if (!result.success) {
      console.error(`🚫 ${name}`);
      throw new AggregateError(
        result.logs.map((log) => new Error(log.message)),
        `Failed to build for target: ${target}`,
      );
    }

    console.log(`✅ ${buildPackages ? name : target}`);
  }),
]);

function bunTarget(os: OS, arch: Arch): Bun.Build.CompileTarget {
  return `bun-${os}-${arch}`;
}

function npmOs(os: OS) {
  if (os === "windows") return "win32";
  return os;
}
