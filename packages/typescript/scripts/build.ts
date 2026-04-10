#!/usr/bin/env bun

// This script builds the Alumnium for multiple target platforms using Bun.

import { $, type BunPlugin } from "bun";
import { snakeCase } from "case-anything";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stringify as tomlStringify } from "smol-toml";
import { z } from "zod";
import { ALUMNIUM_VERSION } from "../src/package.ts";

//#region Types and consts

//#region Build targets

const BASE_BUILD_TARGETS = [
  "bin",
  "npm",
  "npm:main",
  "npm:cli",
  "pip",
] as const;

const BuildTarget = z.enum(BASE_BUILD_TARGETS);

const BUILD_ONLY =
  process.env.BUILD_ONLY?.split(",")?.map((target) =>
    BuildTarget.parse(target),
  ) || BASE_BUILD_TARGETS;

const BUILD_NPM_MAIN =
  BUILD_ONLY.includes("npm:main") || BUILD_ONLY.includes("npm");

const BUILD_NPM_CLI =
  BUILD_ONLY.includes("npm:cli") || BUILD_ONLY.includes("npm");

const BUILD_NPM = BUILD_NPM_MAIN && BUILD_NPM_CLI;

const BUILD_PIP = BUILD_ONLY.includes("pip");

const BUILD_BIN =
  BUILD_PIP || BUILD_NPM || BUILD_NPM_CLI || BUILD_ONLY.includes("bin");

//#endregion

//#region Paths

// Base paths
const REPO_ROOT_DIR = path.resolve(import.meta.dirname, "../../../");
const PKG_DIR = path.resolve(import.meta.dirname, "..");
const TMP_DIR = path.resolve(PKG_DIR, "tmp");
const DIST_DIR = path.resolve(PKG_DIR, "dist");

// Bin paths
const BIN_SRC_PATH = path.resolve(PKG_DIR, "src/cli/bin.ts");
const DIST_BIN_DIR = path.resolve(DIST_DIR, "bin");

// npm paths
const MAIN_NPM_SRC_DIR = path.resolve(PKG_DIR, "src");
const MAIN_NPM_SRC_CLIENT_PATH = path.resolve(
  MAIN_NPM_SRC_DIR,
  "client/index.ts",
);
const MAIN_NPM_SRC_BIN_PATH = path.resolve(
  MAIN_NPM_SRC_DIR,
  "cli/binWrapper.ts",
);
const DIST_NPM_MAIN_PKG_DIR = path.resolve(DIST_DIR, "npm-alumnium");
const DIST_NPM_DIR = path.resolve(DIST_DIR, "npm");
const PACKAGE_JSON_NAME = "package.json";

// Pip paths
const DIST_PIP_DIR = path.resolve(DIST_DIR, "pip");
const PIP_CLI_PKG_NAME = "alumnium-cli";
const PIP_CLI_MODULE_NAME = getPipModuleName(PIP_CLI_PKG_NAME);
const DIST_PIP_CLI_PKG_DIR = path.resolve(DIST_DIR, `pip-${PIP_CLI_PKG_NAME}`);
const PYPROJECT_NAME = "pyproject.toml";

// Assets
const COMMON_PKG_ASSETS = ["../../LICENSE.md"];
const CORE_PKG_ASSETS = [...COMMON_PKG_ASSETS, "../../README.md"];

//#endregion

//#region Meta

const PIP_MAIN_URL = "https://pypi.org/project/alumnium/";

const PIP_ANY_PLATFORM_TAG = "any";

const META_AUTHORS = [
  { name: "Alex Rodionov", email: "p0deje@gmail.com" },
  { name: "Tatiana Shepeleva", email: "tati.shep@gmail.com" },
];

//#endregion

//#region Platforms

const OSES = ["linux", "darwin", "windows"] as const;

type OS = (typeof OSES)[number];

const ARCHS = ["x64", "arm64"] as const;

type Arch = (typeof ARCHS)[number];

interface TargetPlatform {
  os: OS;
  arch: Arch;
  target: string;
  binName: string;
  binPath: string;
  npm: TargetPkg;
  pip: TargetPkg;
}

interface TargetPkg {
  name: string;
  dir: string;
  mainUrl: string;
  binPath: string;
}

const TARGET_PLATFORMS: TargetPlatform[] = OSES.flatMap((os) =>
  ARCHS.map((arch) => {
    const target = `${os}-${arch}`;
    const binName = getBinName(os, target);

    const npmDir = path.resolve(DIST_DIR, `npm-alumnium-cli-${target}`);

    const pipName = `alumnium-cli-${target}`;
    const pipDir = path.resolve(DIST_DIR, `pip-${pipName}`);

    return {
      os,
      arch,
      target,
      binName,
      binPath: path.resolve(DIST_BIN_DIR, binName),
      npm: {
        name: `@alumnium/cli-${target}`,
        dir: npmDir,
        mainUrl: "https://www.npmjs.com/package/alumnium",
        binPath: path.resolve(npmDir, binName),
      },
      pip: {
        name: pipName,
        dir: pipDir,
        mainUrl: PIP_MAIN_URL,
        binPath: path.resolve(pipDir, "src", PIP_CLI_MODULE_NAME, binName),
      },
    };
  }),
);

//#endregion

//#endregion

//#region Bun plugins

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

// playwright-core's nodePlatform.js resolves its own package.json via
// require.resolve() at module load time. In a compiled Bun binary the absolute
// dev-machine path doesn't exist, crashing startup. coreDir is only used for
// stack-trace prefix filtering so falling back to "" is safe.
const playwrightPatcherPlugin: BunPlugin = {
  name: "playwright-patcher",
  setup(build) {
    build.onLoad(
      { filter: /playwright-core.+nodePlatform\.js$/, namespace: "file" },
      async (args) => {
        const input = await Bun.file(args.path).text();
        return {
          contents: input.replace(
            'require.resolve("../../../package.json")',
            '(() => { try { return require.resolve("../../../package.json"); } catch { return ""; } })()',
          ),
        };
      },
    );
  },
};

//#endregion

//#region Main

await main();

async function main() {
  console.log(`🚧 Building Alumnium ${ALUMNIUM_VERSION}...`);

  //#region Clean up

  await Promise.all([
    // Binaries
    BUILD_BIN && cleanUpDir(DIST_BIN_DIR),
    // npm
    BUILD_NPM_MAIN && cleanUpDir(DIST_NPM_MAIN_PKG_DIR),
    cleanUpMatchingInDir(
      [
        BUILD_NPM_MAIN && "alumnium-[0-9]*.[0-9]*.[0-9]*.tgz",
        BUILD_NPM_CLI && "alumnium-cli-*.tgz",
      ],
      DIST_NPM_DIR,
    ),
    ...TARGET_PLATFORMS.flatMap(({ npm }) => BUILD_NPM_CLI && cleanUpPkg(npm)),
    // pip
    BUILD_PIP && cleanUpDir(DIST_PIP_DIR),
    BUILD_PIP && cleanUpDir(DIST_PIP_CLI_PKG_DIR),
    ...TARGET_PLATFORMS.flatMap(({ pip }) => BUILD_PIP && cleanUpPkg(pip)),
  ]);

  //#endregion

  //#region Binaries

  if (BUILD_BIN) {
    console.log("\n🌀 Building binaries:\n");

    await Promise.all(
      TARGET_PLATFORMS.map(async ({ os, arch, target, binPath }) => {
        const result = await Bun.build({
          entrypoints: [BIN_SRC_PATH],
          external: ["chromium-bidi", "electron"],
          compile: {
            target: getBunTarget(os, arch),
            outfile: binPath,
          },
          plugins: [
            loggerPathPlugin,
            depsPatcherPlugin,
            playwrightPatcherPlugin,
          ],
          define: {
            SINGLE_FILE_EXECUTABLE: "true",
          },
        });

        if (!result.success) {
          console.error(`🔴 ${target}`);
          throw new AggregateError(
            result.logs.map((log) => new Error(log.message)),
            `Failed to build for target: ${target}`,
          );
        }

        console.log(`🟢 ${target} (${cwdRelPath(binPath)})`);
      }),
    );
  }

  //#endregion

  //#region npm

  if (BUILD_NPM_MAIN || BUILD_NPM_CLI) {
    console.log("\n🌀 Building npm packages...\n");

    await Promise.all([
      //#region npm-alumnium
      (async () => {
        if (!BUILD_NPM_MAIN) return;

        const pkgPackageJsonPath = path.resolve(PKG_DIR, PACKAGE_JSON_NAME);

        const distPackageJson = JSON.parse(
          await fs.readFile(pkgPackageJsonPath, "utf-8"),
        );

        const baseBuildConfig: Bun.BuildConfig = {
          root: PKG_DIR,
          entrypoints: [],
          outdir: DIST_NPM_MAIN_PKG_DIR,
          sourcemap: true,
          target: "node",
          plugins: [loggerPathPlugin],
          packages: "external",
        };

        await Promise.all([
          ...(["esm", "cjs"] as const).map((format) =>
            Bun.build({
              ...baseBuildConfig,
              entrypoints: [MAIN_NPM_SRC_CLIENT_PATH],
              format,
              naming: `[dir]/[name].${format === "esm" ? "js" : "cjs"}`,
            }),
          ),

          Bun.build({
            ...baseBuildConfig,
            entrypoints: [MAIN_NPM_SRC_BIN_PATH],
            format: "esm",
          }),

          $`cd ${PKG_DIR} && bun tsgo --project tsconfig.build.json`,

          copyAssets(CORE_PKG_ASSETS, DIST_NPM_MAIN_PKG_DIR),
        ]);

        distPackageJson.optionalDependencies ??= {};
        distPackageJson.publishConfig ??= {};
        distPackageJson.publishConfig.optionalDependencies ??= {};

        distPackageJson.exports = distPackageJson.publishConfig.exports || {};
        distPackageJson.bin = distPackageJson.publishConfig.bin;

        TARGET_PLATFORMS.forEach(({ npm }) => {
          distPackageJson.optionalDependencies[npm.name] = `file:${npm.dir}`;
          distPackageJson.publishConfig.optionalDependencies[npm.name] =
            ALUMNIUM_VERSION;
        });

        const distPackageJsonPath = path.resolve(
          DIST_NPM_MAIN_PKG_DIR,
          PACKAGE_JSON_NAME,
        );
        await fs.writeFile(
          distPackageJsonPath,
          JSON.stringify(distPackageJson, null, 2),
        );

        await finalizeNpm(DIST_NPM_MAIN_PKG_DIR);

        const tarPath = await buildNpmTar("alumnium", DIST_NPM_MAIN_PKG_DIR);

        console.log(
          `🟢 alumnium (${cwdRelPath(DIST_NPM_MAIN_PKG_DIR)} / ${tarPath})`,
        );
      })(),
      //#endregion

      //#region npm-alumnium-cli-<os>-<arch>
      ...TARGET_PLATFORMS.map(async (platform) => {
        if (!BUILD_NPM_CLI) return;

        const { arch, os, binName, target, npm } = platform;

        const packageJson = {
          name: npm.name,
          version: ALUMNIUM_VERSION,
          description: `Alumnium CLI binary for ${target}`,
          repository: "https://github.com/alumnium-hq/alumnium",
          license: "MIT",
          os: [getNpmOs(os)],
          cpu: [arch],
          bin: { [`alumnium-${target}`]: `./${binName}` },
          main: "index.js",
        };

        const indexJs = `
const path = require("node:path");

const BIN_NAME = "${binName}";

exports.binPath = function binPath() {
  return path.resolve(__dirname, BIN_NAME);
}
`;

        await Promise.all([
          buildTargetPkgCommons(platform, npm),

          fs.writeFile(
            path.join(npm.dir, PACKAGE_JSON_NAME),
            JSON.stringify(packageJson, null, 2),
          ),

          fs.writeFile(path.join(npm.dir, "index.js"), indexJs),
        ]);

        await finalizeNpm(npm.dir);

        const tarPath = await buildNpmTar(npm.name, npm.dir);

        console.log(
          `🟢 ${npm.name} (${cwdRelPath(npm.dir)} / ${cwdRelPath(tarPath)})`,
        );
      }),
      //#endregion
    ]);
  }

  //#endregion

  //#region pip

  if (BUILD_PIP) {
    console.log("\n🌀 Building pip packages...\n");

    //#region pip-alumnium-cli-<os>-<arch>
    await Promise.all(
      TARGET_PLATFORMS.map(async (platform) => {
        const { binName, target, pip } = platform;

        const initPy = `from pathlib import Path

BIN_NAME = "${binName}"


def bin_path() -> Path:
    return Path(__file__).with_name(BIN_NAME)


__all__ = ["bin_path"]
`;

        const pyProject: PyProject = {
          name: PIP_CLI_PKG_NAME,
          description: `Alumnium CLI binary for ${target}`,
          moduleName: PIP_CLI_MODULE_NAME,
        };

        await Promise.all([
          writePyProjectToml(pip.dir, pyProject),

          writeMainPy(pip.dir, PIP_CLI_MODULE_NAME, initPy),

          buildTargetPkgCommons(platform, pip),
        ]);

        const whlPath = await finalizePip(
          PIP_CLI_PKG_NAME,
          pip.dir,
          getPipWheelTagTarget(platform),
        );

        console.log(
          `🟢 ${pip.name} (${cwdRelPath(pip.dir)} / ${cwdRelPath(whlPath)})`,
        );
      }),
    );
    //#endregion

    await generateSourceTarGz();
  }

  //#endregion

  console.log("\n🎉 Build completed successfully!");
}

//#endregion

//#region Internals

function buildTargetPkgCommons(target: TargetPlatform, pkg: TargetPkg) {
  const { target: targetStr, binPath } = target;
  const { name, dir, binPath: pkgBinPath } = pkg;

  const readmeMd = `# ${name}

Alumnium CLI binary package for ${targetStr}. See [the main \`alumnium\` package page](${pkg.mainUrl}) for more details.
`;

  return Promise.all([
    copyAssets(COMMON_PKG_ASSETS, dir),

    $`cp ${binPath} ${pkgBinPath}`,

    fs.writeFile(path.join(pkg.dir, "README.md"), readmeMd),
  ]);
}

async function writeMainPy(dir: string, moduleName: string, content: string) {
  const moduleDir = path.resolve(dir, "src", moduleName);
  return fs
    .mkdir(moduleDir, { recursive: true })
    .then(() => fs.writeFile(path.resolve(moduleDir, "__init__.py"), content));
}

async function buildPipWheel(
  name: string,
  dir: string,
  tagArg: string | undefined,
) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const tmpWhlDir = await fs
    .mkdtemp(path.join(TMP_DIR, "alumnium-whl"))
    .then((name) => path.resolve(os.tmpdir(), name));

  await $`uv build --wheel --out-dir ${tmpWhlDir}`.cwd(dir).quiet();

  const tmpAnyWhlPath = path.join(
    tmpWhlDir,
    pipWheelFileName(name, PIP_ANY_PLATFORM_TAG),
  );
  const tag = tagArg || PIP_ANY_PLATFORM_TAG;
  const tagFileName = pipWheelFileName(name, tag);
  const tmpTagWhlPath = path.join(tmpWhlDir, tagFileName);
  const tagWhlPath = path.join(DIST_PIP_DIR, tagFileName);
  await $`wheel tags ${tmpAnyWhlPath} --platform-tag ${tag}`.quiet();
  await $`cp ${tmpTagWhlPath} ${tagWhlPath}`.quiet();

  await fs.rm(tmpWhlDir, { recursive: true, force: true });

  return tagWhlPath;
}

function pipWheelFileName(name: string, platformTag: string): string {
  const version = pipWheelVersion(ALUMNIUM_VERSION);
  return `${name.replace(/-/g, "_")}-${version}-py3-none-${platformTag}.whl`;
}

// Pip and NPM has different rules for alpha versions. NPM allows hyphens (e.g. 0.20.0-alpha.1) while pip doesn't (it expects 0.20.0a1).
function pipWheelVersion(version: string): string {
  return version.replace(/-alpha\.(\d+)/, "a$1");
}

namespace PyProject {
  export interface Source {
    path: string;
  }
}

interface PyProject {
  name: string;
  description: string;
  moduleName: string;
  deps?: string[];
  sources?: Record<string, PyProject.Source>;
}

async function writePyProjectToml(dir: string, pyProject: PyProject) {
  const toml = getPyProjectToml(pyProject);
  return fs.writeFile(path.resolve(dir, PYPROJECT_NAME), toml);
}

function getPyProjectToml(project: PyProject) {
  const { name, description, moduleName, deps, sources } = project;

  // TODO: Read `requires-python`, `license`, etc. from the packages/python/pyproject.toml
  // and packages/typescript/package.json.
  const toml = tomlStringify({
    project: {
      name,
      version: ALUMNIUM_VERSION,
      description,
      authors: META_AUTHORS,
      license: "MIT",
      readme: "README.md",
      "requires-python": ">=3.10,<4.0",
      dependencies: deps || [],
      urls: {
        Homepage: "https://alumnium.ai/",
        Repository: "https://github.com/alumnium-hq/alumnium",
        Issues: "https://github.com/alumnium-hq/alumnium/issues",
        Documentation: "https://alumnium.ai/docs/",
      },
    },

    ...(sources ? { "tool.uv.sources": sources } : {}),

    "tool.uv.build-backend": {
      "module-name": moduleName,
      "module-root": "src",
    },

    "build-system": {
      "build-backend": "uv_build",
      requires: ["uv_build>=0.11.2,<0.12"],
    },
  });

  // NOTE: smol-toml (as well as alternatives like jsr:@std/toml) add quotes
  // around `["tool.uv.build-backend"]` (as well as `["tool.uv.sources".alumnium-cli-linux-x64]`)
  // which results in an invalid TOML.
  return toml.replace(/^\[.*\]$/gm, (block) =>
    block.replace(/"([\w.-]+)"/g, "$1"),
  );
}

async function generateSourceTarGz() {
  await $`VERSION=${ALUMNIUM_VERSION} BUILD_SUBSCRIPT=true ./scripts/build-pip-src.sh`;
}

async function finalizePip(pipName: string, pipDir: string, tag?: string) {
  await oxfmtFormat(pipDir);
  await pyprojectsortFormat(pipDir);
  await ruffFormat(pipDir);
  await ruffLintFix(pipDir);
  const whlPath = await buildPipWheel(pipName, pipDir, tag);
  return whlPath;
}

async function buildNpmTar(name: string, dir: string) {
  await $`bun pm pack --destination ${DIST_NPM_DIR}`.cwd(dir).quiet();
  return path.resolve(DIST_NPM_DIR, `${name}-${ALUMNIUM_VERSION}.tgz`);
}

async function finalizeNpm(npmDir: string) {
  await oxfmtFormat(npmDir);
}

function ruffLintFix(dir: string) {
  return $`ruff check . --fix`.cwd(dir).quiet();
}

function ruffFormat(dir: string) {
  return $`ruff format .`.cwd(dir).quiet();
}

function oxfmtFormat(dir: string) {
  return $`bun oxfmt .`.cwd(dir).quiet();
}

function pyprojectsortFormat(dir: string) {
  return $`pyprojectsort ${PYPROJECT_NAME}`
    .cwd(dir)
    .quiet()
    .catch((err) => {
      // NOTE: pyprojectsort returns a non-zero exit code when it reformats
      // the file, so we need to silence the error. Typical Python.
      if (err instanceof Bun.$.ShellError) {
        if (err.stdout.includes(`Reformatted '${PYPROJECT_NAME}'`)) return;
      }
      throw err;
    });
}

function getPipWheelTagTarget(platform: TargetPlatform): string {
  const { os, arch } = platform;

  switch (os) {
    case "linux":
      switch (arch) {
        case "x64":
          return "manylinux_2_28_x86_64";
        case "arm64":
          return "manylinux_2_28_aarch64";
      }

    case "darwin":
      switch (arch) {
        case "x64":
          return "macosx_x86_64";
        case "arm64":
          return "macosx_arm64";
      }

    case "windows":
      switch (arch) {
        case "x64":
          return "win_amd64";
        case "arm64":
          return "win_arm64";
      }
  }
}

function getPipModuleName(pkgName: string) {
  return snakeCase(pkgName);
}

function cwdRelPath(absPath: string) {
  return path.relative(process.cwd(), absPath);
}

async function cleanUpPkg(pkg: TargetPkg) {
  const { dir, binPath } = pkg;
  await cleanUpDir(dir);
  const binDir = path.dirname(binPath);
  await $`mkdir -p ${binDir}`;
}

async function cleanUpDir(dir: string) {
  await $`rm -rf ${dir}`;
  await $`mkdir -p ${dir}`;
}

async function cleanUpMatchingInDir(patterns: unknown[], dir: string) {
  await $`mkdir -p ${dir}`;
  await Promise.all(
    patterns.map(
      (pattern) =>
        typeof pattern === "string" &&
        $`find "${dir}" -maxdepth 1 -type f -name '${pattern}' -exec rm -f {} +`,
    ),
  );
}

function copyAssets(assets: string[], dir: string) {
  return Promise.all(
    assets.map((assetPath) => $`cp ${path.resolve(PKG_DIR, assetPath)} ${dir}`),
  );
}

function getBinName(os: OS, target: string) {
  const ext = os === "windows" ? ".exe" : "";
  return `alumnium-${ALUMNIUM_VERSION}-${target}${ext}`;
}

function getBunTarget(os: OS, arch: Arch): Bun.Build.CompileTarget {
  return `bun-${os}-${arch}`;
}

function getNpmOs(os: OS) {
  if (os === "windows") return "win32";
  return os;
}

//#endregion
