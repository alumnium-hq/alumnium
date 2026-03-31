#!/usr/bin/env bun

// This script builds the Alumnium for multiple target platforms using Bun.

import { $, type BunPlugin } from "bun";
import fs from "node:fs/promises";
import path from "node:path";
import { ALUMNIUM_VERSION } from "../src/package.js";

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
}

const COMMON_PKG_ASSETS = ["../../LICENSE.md"];
const CORE_PKG_ASSETS = [...COMMON_PKG_ASSETS, "../../README.md"];

const REPO_ROOT_DIR = path.resolve(import.meta.dirname, "../../");
const PKG_DIR = path.resolve(import.meta.dirname, "..");
const SRC_CLI_PATH = path.resolve(PKG_DIR, "src/cli/main.ts");
const DIST_DIR = path.resolve(PKG_DIR, "dist");
const DIST_CORE_PKG_DIR = path.resolve(DIST_DIR, "npm-alumnium");
const DIST_BIN_DIR = path.resolve(DIST_DIR, "bin");
const DIST_PIP_DIR = path.resolve(DIST_DIR, "pip");
const PIP_CLI_PKG_NAME = "alumnium-cli";
const PIP_CLI_MODULE_NAME = "alumnium_cli";
const PIP_CLI_TARGET_MODULE_NAME = `${PIP_CLI_MODULE_NAME}_bin`;
const DIST_PIP_CLI_PKG_DIR = path.resolve(DIST_DIR, `pip-${PIP_CLI_PKG_NAME}`);
const PIP_MAIN_URL = "https://pypi.org/project/alumnium/";
const META_AUTHORS = [
  "Alex Rodionov <p0deje@gmail.com>",
  "Tatiana Shepeleva <tati.shep@gmail.com>",
];

const TARGET_PLATFORMS: TargetPlatform[] = OSES.flatMap((os) =>
  ARCHS.map((arch) => {
    const target = `${os}-${arch}`;
    const binName = getBinName(os, target);
    const pipName = `alumnium-cli-${target}`;
    return {
      os,
      arch,
      target,
      binName,
      binPath: path.resolve(DIST_BIN_DIR, binName),
      npm: {
        name: `@alumnium/cli-${target}`,
        dir: path.resolve(DIST_DIR, `npm-alumnium-cli-${target}`),
        mainUrl: "https://www.npmjs.com/package/alumnium",
      },
      pip: {
        name: pipName,
        dir: path.resolve(DIST_DIR, `pip-${pipName}`),
        mainUrl: PIP_MAIN_URL,
      },
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

await main();

async function main() {
  console.log(`Building Alumnium ${ALUMNIUM_VERSION}...`);

  await Promise.all([
    cleanUpDir(DIST_BIN_DIR),
    cleanUpDir(DIST_CORE_PKG_DIR),
    cleanUpDir(DIST_PIP_DIR),
    cleanUpDir(DIST_PIP_CLI_PKG_DIR),
    ...TARGET_PLATFORMS.flatMap(({ npm, pip }) => [
      cleanUpDir(npm.dir),
      cleanUpDir(pip.dir),
    ]),
  ]);

  console.log("\nBinaries:");

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
        console.error(`🚫 ${target}`);
        throw new AggregateError(
          result.logs.map((log) => new Error(log.message)),
          `Failed to build for target: ${target}`,
        );
      }

      console.log(`✅ ${target} (${cwdRelPath(binPath)})`);
    }),
  );

  console.log("\nNpm packages:");

  await Promise.all([
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

      console.log(`✅ alumnium (${cwdRelPath(DIST_CORE_PKG_DIR)})`);
    })(),

    ...TARGET_PLATFORMS.map(async (platform) => {
      const { arch, os, binName, target, npm } = platform;
      await Promise.all([
        buildTargetPkgCommons(platform, npm),

        fs.writeFile(
          path.join(npm.dir, "package.json"),
          JSON.stringify(
            {
              name: npm.name,
              version: ALUMNIUM_VERSION,
              description: `Alumnium CLI binary for ${target}`,
              repository: "https://github.com/alumnium-hq/alumnium",
              license: "MIT",
              os: [getNpmOs(os)],
              cpu: [arch],
              bin: { alumnium: `./${binName}` },
            },
            null,
            2,
          ),
        ),
      ]);

      console.log(`✅ ${npm.name} (${cwdRelPath(npm.dir)})`);
    }),
  ]);

  console.log("\nPip packages:");

  await Promise.all([
    (async () => {
      const initPy = `from ${PIP_CLI_TARGET_MODULE_NAME} import bin_path


__all__ = ["bin_path"]
`;

      const pyProject = getPyProjectToml({
        name: PIP_CLI_PKG_NAME,
        description: `Alumnium CLI binary `,
        poetryLines: [
          `packages = [{ include = "${PIP_CLI_MODULE_NAME}", from = "src" }]`,
        ],
        depsLines: TARGET_PLATFORMS.map(
          ({ os, arch, pip }) =>
            `${pip.name} = { version = "==${ALUMNIUM_VERSION}", markers = "${getPipMarker(os, arch)}" }`,
        ),
      });

      await Promise.all([
        fs.writeFile(
          path.join(DIST_PIP_CLI_PKG_DIR, "pyproject.toml"),
          pyProject,
        ),

        writeMainPy(DIST_PIP_CLI_PKG_DIR, PIP_CLI_MODULE_NAME, initPy),

        fs.writeFile(
          path.join(DIST_PIP_CLI_PKG_DIR, "README.md"),
          `# ${PIP_CLI_PKG_NAME}

Alumnium CLI binary package. See [the main \`alumnium\` package page](${PIP_MAIN_URL}) for more details.
`,
        ),

        copyAssets(COMMON_PKG_ASSETS, DIST_PIP_CLI_PKG_DIR),
      ]);

      const whlPath = await buildPipWheel(
        PIP_CLI_PKG_NAME,
        DIST_PIP_CLI_PKG_DIR,
      );

      console.log(
        `✅ ${PIP_CLI_PKG_NAME} (${cwdRelPath(DIST_PIP_CLI_PKG_DIR)} / ${cwdRelPath(whlPath)})`,
      );
    })(),

    ...TARGET_PLATFORMS.map(async (platform) => {
      const { binName, target, pip } = platform;

      const initPy = `from pathlib import Path

BIN_NAME = "${binName}"


def bin_path() -> Path:
    return Path(__file__).with_name(BIN_NAME)


__all__ = ["bin_path"]
`;

      const pyProject = getPyProjectToml({
        name: pip.name,
        description: `Alumnium CLI binary for ${target}`,
        poetryLines: [
          `packages = [{ include = "${PIP_CLI_TARGET_MODULE_NAME}", from = "src" }]`,
          `include = [{ path = "./${binName}", format = ["wheel"] }]`,
        ],
      });

      await Promise.all([
        fs.writeFile(path.join(pip.dir, "pyproject.toml"), pyProject),

        writeMainPy(pip.dir, PIP_CLI_TARGET_MODULE_NAME, initPy),

        buildTargetPkgCommons(platform, pip),
      ]);

      const whlPath = await buildPipWheel(pip.name, pip.dir);

      console.log(
        `✅ ${pip.name} (${cwdRelPath(pip.dir)} / ${cwdRelPath(whlPath)})`,
      );
    }),
  ]);
}

function buildTargetPkgCommons(target: TargetPlatform, pkg: TargetPkg) {
  const { binPath } = target;
  return Promise.all([
    copyAssets(COMMON_PKG_ASSETS, pkg.dir),

    $`cp ${binPath} ${pkg.dir}`,

    fs.writeFile(
      path.join(pkg.dir, "README.md"),
      `# ${pkg.name}

Alumnium CLI binary package for ${target.target}. See [the main \`alumnium\` package page](${pkg.mainUrl}) for more details.
`,
    ),
  ]);
}

interface PyProject {
  name: string;
  description: string;
  poetryLines?: string[];
  depsLines?: string[];
}

async function writeMainPy(dir: string, moduleName: string, content: string) {
  const moduleDir = path.resolve(dir, "src", moduleName);
  return fs
    .mkdir(moduleDir, { recursive: true })
    .then(() => fs.writeFile(path.resolve(moduleDir, "__init__.py"), content));
}

async function buildPipWheel(name: string, dir: string) {
  await $`cd ${dir} && poetry build --format wheel --output ${DIST_PIP_DIR}`.quiet();
  return path.resolve(
    DIST_PIP_DIR,
    `${name.replace(/-/g, "_")}-${ALUMNIUM_VERSION}-py3-none-any.whl`,
  );
}

function getPyProjectToml(project: PyProject) {
  const { name, description, poetryLines, depsLines } = project;
  return `[tool.poetry]
name = "${name}"
version = "${ALUMNIUM_VERSION}"
description = ${JSON.stringify(description)}
authors = ${JSON.stringify(META_AUTHORS, null, 2)}
license = "MIT"
readme = "README.md"
repository = "https://github.com/alumnium-hq/alumnium"
${poetryLines ? poetryLines.join("\n") + "\n" : ""}
[tool.poetry.dependencies]
python = ">=3.10,<4.0"
${depsLines ? depsLines.join("\n") + "\n" : ""}
[build-system]
build-backend = "poetry.core.masonry.api"
requires = ["poetry-core"]
`;
}

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

function cwdRelPath(absPath: string) {
  return path.relative(process.cwd(), absPath);
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
