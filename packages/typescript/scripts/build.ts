#!/usr/bin/env bun

// This script builds the Alumnium for multiple target platforms using Bun.

import { $, type BunPlugin } from "bun";
import { snakeCase } from "case-anything";
import fs from "node:fs/promises";
import path from "node:path";
import { stringify as tomlStringify } from "smol-toml";
import { ALUMNIUM_VERSION } from "../src/package.js";

//#region Types and consts

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

const COMMON_PKG_ASSETS = ["../../LICENSE.md"];
const CORE_PKG_ASSETS = [...COMMON_PKG_ASSETS, "../../README.md"];

const REPO_ROOT_DIR = path.resolve(import.meta.dirname, "../../");
const PKG_DIR = path.resolve(import.meta.dirname, "..");
const SRC_CLI_PATH = path.resolve(PKG_DIR, "src/cli/bin.ts");
const DIST_DIR = path.resolve(PKG_DIR, "dist");
const DIST_CORE_PKG_DIR = path.resolve(DIST_DIR, "npm-alumnium");
const DIST_BIN_DIR = path.resolve(DIST_DIR, "bin");
const DIST_NPM_DIR = path.resolve(DIST_DIR, "npm");
const DIST_PIP_DIR = path.resolve(DIST_DIR, "pip");
const PIP_CLI_PKG_NAME = "alumnium-cli";
const PIP_CLI_MODULE_NAME = getPipModuleName(PIP_CLI_PKG_NAME);
const PIP_CLI_TARGET_MODULE_NAME = `${PIP_CLI_MODULE_NAME}_bin`;
const DIST_PIP_CLI_PKG_DIR = path.resolve(DIST_DIR, `pip-${PIP_CLI_PKG_NAME}`);
const PIP_MAIN_URL = "https://pypi.org/project/alumnium/";
const PYPROJECT_NAME = "pyproject.toml";
const META_AUTHORS = [
  { name: "Alex Rodionov", email: "p0deje@gmail.com" },
  { name: "Tatiana Shepeleva", email: "tati.shep@gmail.com" },
];

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
        binPath: path.resolve(
          pipDir,
          "src",
          PIP_CLI_TARGET_MODULE_NAME,
          binName,
        ),
      },
    };
  }),
);

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

//#endregion

//#region Main

await main();

async function main() {
  console.log(`🚧 Building Alumnium ${ALUMNIUM_VERSION}...\n`);

  //#region Clean up

  await Promise.all([
    cleanUpDir(DIST_BIN_DIR),
    cleanUpDir(DIST_CORE_PKG_DIR),
    cleanUpDir(DIST_NPM_DIR),
    cleanUpDir(DIST_PIP_DIR),
    cleanUpDir(DIST_PIP_CLI_PKG_DIR),
    ...TARGET_PLATFORMS.flatMap(({ npm, pip }) => [
      cleanUpPkg(npm),
      cleanUpPkg(pip),
    ]),
  ]);

  //#endregion

  //#region Binaries

  console.log("🌀 Building binaries:\n");

  await Promise.all(
    TARGET_PLATFORMS.map(async ({ os, arch, target, binPath }) => {
      const result = await Bun.build({
        entrypoints: [SRC_CLI_PATH],
        root: PKG_DIR,
        compile: {
          target: getBunTarget(os, arch),
          outfile: binPath,
        },
        plugins: [loggerPathPlugin, depsPatcherPlugin],
        define: {
          BUNDLED: "true",
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

  //#endregion

  //#region npm

  console.log("\n🌀 Building npm packages...\n");

  await Promise.all([
    //#region npm-alumnium
    (async () => {
      await Promise.all([
        $`cd ${PKG_DIR} && bun tsgo --project tsconfig.build.json`,
        copyAssets(CORE_PKG_ASSETS, DIST_CORE_PKG_DIR),
      ]);

      const distPkgJsonPath = path.resolve(DIST_CORE_PKG_DIR, "package.json");
      const distPackageJson = JSON.parse(
        await fs.readFile(distPkgJsonPath, "utf-8"),
      );

      distPackageJson.optionalDependencies = {};
      TARGET_PLATFORMS.forEach(({ npm }) => {
        distPackageJson.optionalDependencies[npm.name] = ALUMNIUM_VERSION;
      });

      await fs.writeFile(
        distPkgJsonPath,
        JSON.stringify(distPackageJson, null, 2),
      );

      await finalizeNpm(DIST_CORE_PKG_DIR);

      const tarPath = await buildNpmTar("alumnium", DIST_CORE_PKG_DIR);

      console.log(
        `🟢 alumnium (${cwdRelPath(DIST_CORE_PKG_DIR)} / ${tarPath})`,
      );
    })(),
    //#endregion

    //#region npm-alumnium-cli-<os>-<arch>
    ...TARGET_PLATFORMS.map(async (platform) => {
      const { arch, os, binName, target, npm } = platform;

      const packageJson = {
        name: npm.name,
        version: ALUMNIUM_VERSION,
        description: `Alumnium CLI binary for ${target}`,
        repository: "https://github.com/alumnium-hq/alumnium",
        license: "MIT",
        os: [getNpmOs(os)],
        cpu: [arch],
        bin: { alumnium: `./${binName}` },
      };

      await Promise.all([
        buildTargetPkgCommons(platform, npm),

        fs.writeFile(
          path.join(npm.dir, "package.json"),
          JSON.stringify(packageJson, null, 2),
        ),
      ]);

      await finalizeNpm(npm.dir);

      const tarPath = await buildNpmTar(npm.name, npm.dir);

      console.log(
        `🟢 ${npm.name} (${cwdRelPath(npm.dir)} / ${cwdRelPath(tarPath)})`,
      );
    }),
    //#endregion
  ]);

  //#endregion

  //#region pip

  console.log("\n🌀 Building pip packages...\n");

  await Promise.all([
    //#region pip-alumnium-cli
    (async () => {
      const initPy = `from ${PIP_CLI_TARGET_MODULE_NAME} import bin_path


__all__ = ["bin_path"]
`;

      const pyProject: PyProject = {
        name: PIP_CLI_PKG_NAME,
        description: `Alumnium CLI binary `,
        moduleName: PIP_CLI_MODULE_NAME,
        deps: TARGET_PLATFORMS.map(
          ({ os, arch, pip }) =>
            `${pip.name}==${ALUMNIUM_VERSION}; ${getPipMarker(os, arch)}`,
        ),
        sources: Object.fromEntries(
          TARGET_PLATFORMS.map(({ pip }) => [
            pip.name,
            { path: `../pip-${pip.name}` },
          ]),
        ),
      };

      await Promise.all([
        writePyProjectToml(DIST_PIP_CLI_PKG_DIR, pyProject),

        writeMainPy(DIST_PIP_CLI_PKG_DIR, PIP_CLI_MODULE_NAME, initPy),

        fs.writeFile(
          path.join(DIST_PIP_CLI_PKG_DIR, "README.md"),
          `# ${PIP_CLI_PKG_NAME}

Alumnium CLI binary package. See [the main \`alumnium\` package page](${PIP_MAIN_URL}) for more details.
`,
        ),

        copyAssets(COMMON_PKG_ASSETS, DIST_PIP_CLI_PKG_DIR),
      ]);

      const whlPath = await finalizePip(PIP_CLI_PKG_NAME, DIST_PIP_CLI_PKG_DIR);

      console.log(
        `🟢 ${PIP_CLI_PKG_NAME} (${cwdRelPath(DIST_PIP_CLI_PKG_DIR)} / ${cwdRelPath(whlPath)})`,
      );
    })(),
    //#endregion

    //#region pip-alumnium-cli-<os>-<arch>
    ...TARGET_PLATFORMS.map(async (platform) => {
      const { binName, target, pip } = platform;

      const initPy = `from pathlib import Path

BIN_NAME = "${binName}"


def bin_path() -> Path:
    return Path(__file__).with_name(BIN_NAME)


__all__ = ["bin_path"]
`;

      const pyProject: PyProject = {
        name: pip.name,
        description: `Alumnium CLI binary for ${target}`,
        moduleName: PIP_CLI_TARGET_MODULE_NAME,
      };

      await Promise.all([
        writePyProjectToml(pip.dir, pyProject),

        writeMainPy(pip.dir, PIP_CLI_TARGET_MODULE_NAME, initPy),

        buildTargetPkgCommons(platform, pip),
      ]);

      const whlPath = await finalizePip(pip.name, pip.dir);

      console.log(
        `🟢 ${pip.name} (${cwdRelPath(pip.dir)} / ${cwdRelPath(whlPath)})`,
      );
    }),
    //#endregion
  ]);

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

async function buildPipWheel(name: string, dir: string) {
  await $`uv build --wheel --out-dir ${DIST_PIP_DIR}`.cwd(dir).quiet();
  return path.resolve(
    DIST_PIP_DIR,
    `${name.replace(/-/g, "_")}-${ALUMNIUM_VERSION}-py3-none-any.whl`,
  );
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

async function finalizePip(pipName: string, pipDir: string) {
  await oxfmtFormat(pipDir);
  await pyprojectsortFormat(pipDir);
  await ruffFormat(pipDir);
  await ruffLintFix(pipDir);
  const whlPath = await buildPipWheel(pipName, pipDir);
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

// function p

function getPipMarker(os: OS, arch: Arch) {
  return `${getPipOsMarker(os)} and ${getPipArchMarker(arch)}`;
}

function getPipOsMarker(os: OS): string {
  switch (os) {
    case "linux":
      return "sys_platform == 'linux'";
    case "darwin":
      return "sys_platform == 'darwin'";
    case "windows":
      return "sys_platform == 'win32'";
  }
}

function getPipArchMarker(arch: Arch): string {
  switch (arch) {
    case "x64":
      return "(platform_machine == 'x86_64' or platform_machine == 'amd64' or platform_machine == 'AMD64')";
    case "arm64":
      return "(platform_machine == 'aarch64' or platform_machine == 'arm64' or platform_machine == 'ARM64')";
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
