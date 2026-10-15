#!/usr/bin/env bun

// This script builds the Alumnium for multiple target platforms using Bun.

import { always } from "alwaysly";
import { $, type BunPlugin } from "bun";
import { snakeCase } from "case-anything";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stringify as tomlStringify } from "smol-toml";
import { z } from "zod";
import { ALUMNIUM_VERSION } from "../../packages/typescript/core/src/package.ts";
import {
  PLAYWRIGHT_CORE_BROWSERS_JSON_ASSET_NAME,
  PLAYWRIGHT_CORE_OOP_DOWNLOAD_ASSET_NAME,
  PLAYWRIGHT_CORE_PACKAGE_JSON_ASSET_NAME,
  SELENIUM_ATOM_ASSET_PREFIX,
  SELENIUM_MANAGER_ASSET_NAMES,
} from "../../packages/typescript/mcp/src/standalone/embeddedAssetNames.ts";
import {
  checkWorkspacePkg,
  getWorkspacePkgs,
  inspectWorkspacePkg,
  isPublishedPkg,
  STUBBED_FILES,
  type WorkspacePkg,
} from "./npmPackages.ts";

//#region Types and consts

//#region Build targets

const BASE_BUILD_TARGETS = [
  "bin",
  // All npm packages: workspace packages and platform CLI binaries.
  "npm",
  // Workspace packages (`npm:<dir>` builds a single one, e.g. `npm:core`).
  "npm:lib",
  // Platform CLI binary packages.
  "npm:cli",
  "pip",
  "maven",
] as const;

const BuildTarget = z.union([
  z.enum(BASE_BUILD_TARGETS),
  z.string().regex(/^npm:[a-z-]+$/),
]);

const BUILD_ONLY: string[] =
  // oxlint-disable-next-line no-process-env -- It is ok in a script
  process.env.BUILD_ONLY?.split(",")?.map((target) =>
    BuildTarget.parse(target),
  ) || [...BASE_BUILD_TARGETS];

const PUBLISHED_PKGS = (await getWorkspacePkgs()).filter(isPublishedPkg);

const BUILD_NPM_PKGS = PUBLISHED_PKGS.filter(
  ({ dirName }) =>
    BUILD_ONLY.includes("npm") ||
    BUILD_ONLY.includes("npm:lib") ||
    BUILD_ONLY.includes(`npm:${dirName}`),
);

const BUILD_NPM_CLI =
  BUILD_ONLY.includes("npm:cli") || BUILD_ONLY.includes("npm");

const BUILD_PIP = BUILD_ONLY.includes("pip");

const BUILD_MAVEN = BUILD_ONLY.includes("maven");

const BUILD_BIN =
  BUILD_PIP || BUILD_NPM_CLI || BUILD_MAVEN || BUILD_ONLY.includes("bin");

//#endregion

//#region Paths

// Base paths
const REPO_ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const PKG_DIR = path.resolve(REPO_ROOT_DIR, "packages/typescript");
const TMP_DIR = path.resolve(PKG_DIR, "tmp");
const DIST_DIR = path.resolve(PKG_DIR, "dist");
// Language-specific CLI packages are built into their language packages.
const PIP_DIST_DIR = path.resolve(REPO_ROOT_DIR, "packages/python/dist");
const MAVEN_DIST_DIR = path.resolve(REPO_ROOT_DIR, "packages/java/dist");
const STANDALONE_EMBEDDED_ASSETS_DIR = path.resolve(
  TMP_DIR,
  "standalone-embedded-assets",
);

// Bin paths
const BIN_SRC_PATH = path.resolve(PKG_DIR, "cli/src/cli/bin.ts");
const DIST_BIN_DIR = path.resolve(DIST_DIR, "bin");

// npm paths
const MAIN_NPM_PKG_NAME = "alumnium";
const MAIN_NPM_BIN_WRAPPER_PATH = "src/cli/binWrapper.ts";
const DIST_NPM_DIR = path.resolve(DIST_DIR, "npm");
// Kept next to (not in) the npm dir, which holds only the released tarballs.
const NPM_PUBLISH_ORDER_PATH = path.resolve(DIST_DIR, "npm-publish-order.txt");
const PACKAGE_JSON_NAME = "package.json";
const TSCONFIG_BUILD_PATH = path.resolve(PKG_DIR, "tsconfig.build.json");

// Pip paths
const DIST_PIP_DIR = path.resolve(PIP_DIST_DIR, "pip");
const PIP_CLI_PKG_NAME = "alumnium-cli";
const PIP_CLI_MODULE_NAME = getPipModuleName(PIP_CLI_PKG_NAME);
const DIST_PIP_CLI_PKG_DIR = path.resolve(
  PIP_DIST_DIR,
  `pip-${PIP_CLI_PKG_NAME}`,
);
const PYPROJECT_NAME = "pyproject.toml";

// Maven paths
const MAVEN_CLI_PKG_NAME = "alumnium-cli";
const MAVEN_RESOURCE_PREFIX = "ai/alumnium/cli";
const DIST_MAVEN_DIR = path.resolve(MAVEN_DIST_DIR, "maven");

// Assets
const COMMON_PKG_ASSETS = ["../../LICENSE.md"];
const CORE_PKG_ASSETS = [...COMMON_PKG_ASSETS, "../../README.md"];

// Banner prepended to the bundled oop download worker. Bun bakes
// playwright-core's `__dirname` into the bundle as the absolute build-machine
// path (e.g. /home/runner/... on CI), so the worker's `require(packageRoot +
// "/package.json")` and `browsers.json` fail on any other machine. This hook
// redirects those requires to the worker's own runtime directory, where
// setupEmbeddedDependencies.ts extracts the matching package.json/browsers.json
// alongside the worker. Mirrors the parent-process hook in that file. The
// banner runs in the worker's outer CJS scope, so its `__dirname` is the real
// extracted location rather than the baked literal.
const PLAYWRIGHT_OOP_DOWNLOAD_BANNER = `"use strict";
{
  const __M = require("node:module");
  const __P = require("node:path");
  const __orig = __M._resolveFilename;
  __M._resolveFilename = function (request, ...rest) {
    if (typeof request === "string") {
      if (request.endsWith("playwright-core/package.json") || request.endsWith("playwright-core\\\\package.json"))
        return __P.join(__dirname, "package.json");
      if (request.endsWith("playwright-core/browsers.json") || request.endsWith("playwright-core\\\\browsers.json"))
        return __P.join(__dirname, "browsers.json");
    }
    return __orig.call(this, request, ...rest);
  };
}
`;

//#endregion

//#region Meta

const PIP_MAIN_URL = "https://pypi.org/project/alumnium/";

const PIP_ANY_PLATFORM_TAG = "any";

const META_AUTHORS = [
  { name: "Alex Rodionov", email: "p0deje@gmail.com" },
  { name: "Sasha Koss", email: "koss@nocorp.me" },
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
  maven: TargetPkg;
}

interface TargetPkg {
  name: string;
  dir: string;
  mainUrl: string;
  binPath: string;
}

interface StandaloneEmbeddedAsset {
  name: string;
  sourcePath: string;
}

const TARGET_PLATFORMS: TargetPlatform[] = OSES.flatMap((os) =>
  ARCHS.map((arch) => {
    const target = `${os}-${arch}`;
    const binName = getBinName(os, target);

    const npmDir = path.resolve(DIST_DIR, `npm-alumnium-cli-${target}`);

    const pipName = `alumnium-cli-${target}`;
    const pipDir = path.resolve(PIP_DIST_DIR, `pip-${pipName}`);

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
      maven: {
        name: `${MAVEN_CLI_PKG_NAME}-${target}`,
        dir: path.resolve(
          MAVEN_DIST_DIR,
          `maven-${MAVEN_CLI_PKG_NAME}-${target}`,
        ),
        mainUrl: "https://central.sonatype.com/artifact/ai.alumnium/alumnium",
        binPath: path.resolve(
          MAVEN_DIST_DIR,
          `maven-${MAVEN_CLI_PKG_NAME}-${target}`,
          MAVEN_RESOURCE_PREFIX,
          target,
          binName,
        ),
      },
    };
  }),
);

//#endregion

//#endregion

//#region Bun plugins

const TELEMETRY_GET_RE = /(Logger|Tracer|Telemetry)\.get\(import\.meta\.url\)/g;

const telemetryPathsRewritePlugin: BunPlugin = {
  name: "telemetry-paths-rewrite",
  setup(build) {
    build.onLoad({ filter: /\.ts$/, namespace: "file" }, async (args) => {
      const input = await Bun.file(args.path).text();

      if (!TELEMETRY_GET_RE.test(input)) return;

      const relativePath = path.relative(REPO_ROOT_DIR, args.path);

      return {
        ...args,
        contents: input.replaceAll(
          TELEMETRY_GET_RE,
          (_, name) => `${name}.get(${JSON.stringify(relativePath)})`,
        ),
      };
    });
  },
};

// Keeps imports of the package's other published entries external (e.g. the
// public `index.ts` re-exporting from `internal.ts`), so each module is
// bundled once and the entries share state like the LlmFactory registry.
// Bun keeps the source specifier of external imports, so the entry source is
// rewritten to point at the sibling's output file.
function siblingEntriesExternalPlugin(
  pkg: WorkspacePkg,
  entryPath: string,
  ext: string,
): BunPlugin {
  const siblings = Object.values(pkg.entries).filter((p) => p !== entryPath);
  const outputSpecifiers = new Set<string>();
  return {
    name: "sibling-entries-external",
    setup(build) {
      if (!siblings.length) return;
      build.onLoad({ filter: /\.ts$/, namespace: "file" }, async (args) => {
        if (args.path !== entryPath) return;
        const input = await Bun.file(args.path).text();
        const contents = input.replace(
          /(["'])(\.{1,2}\/[^"']+)\.ts\1/g,
          (match, quote, specifier) => {
            const resolved = path.resolve(
              path.dirname(entryPath),
              `${specifier}.ts`,
            );
            if (!siblings.includes(resolved)) return match;
            outputSpecifiers.add(`${specifier}${ext}`);
            return `${quote}${specifier}${ext}${quote}`;
          },
        );
        return { contents, loader: "ts" };
      });
      build.onResolve({ filter: /^\./ }, (args) =>
        outputSpecifiers.has(args.path) && args.importer === entryPath
          ? { path: args.path, external: true }
          : undefined,
      );
    },
  };
}

// Bun 1.4 wraps external ESM default exports incorrectly in CommonJS builds.
// Bundle filenamify and its dependency so Node receives the default function.
const cjsFilenamifyPlugin: BunPlugin = {
  name: "cjs-filenamify",
  setup(build) {
    build.onResolve(
      { filter: /^(filenamify|filename-reserved-regex)$/ },
      (args) => ({
        path: Bun.resolveSync(args.path, args.resolveDir),
        external: false,
      }),
    );
  },
};

// @wdio/utils/build/index.js sets client.capabilities only when `scopeType.name === "Browser"`.
// Bun's bundler may rename the internal `Browser` function during compilation, breaking this
// string comparison. We patch it to use reference equality against SCOPE_TYPES.browser instead.
const wdioUtilsPatcherPlugin: BunPlugin = {
  name: "wdio-utils-patcher",
  setup(build) {
    build.onLoad(
      { filter: /@wdio\/utils.+index\.js$/, namespace: "file" },
      async (args) => {
        const input = await Bun.file(args.path).text();
        if (!input.includes('scopeType.name === "Browser"')) {
          return;
        }
        return {
          contents: input.replace(
            'scopeType.name === "Browser"',
            "scopeType === SCOPE_TYPES.browser",
          ),
        };
      },
    );
  },
};

// webdriverio/build/node.js uses `await import(options.automationProtocol || "webdriver")` to
// load the WebDriver class. Bun's bundler can't statically analyze this computed import specifier,
// so it doesn't bundle "webdriver" into the binary, causing a runtime error. The file also has
// a module-level `var webdriverImport;` (always undefined) that short-circuits the dynamic import
// when set. We patch it to use the already-statically-imported `WebDriver` class instead.
const webdriverIOPatcherPlugin: BunPlugin = {
  name: "webdriverio-patcher",
  setup(build) {
    build.onLoad(
      { filter: /webdriverio.+node\.js$/, namespace: "file" },
      async (args) => {
        const input = await Bun.file(args.path).text();
        if (!input.includes("var webdriverImport;")) {
          return;
        }
        return {
          contents: input.replace(
            "var webdriverImport;",
            "var webdriverImport = WebDriver;",
          ),
        };
      },
    );
  },
};

const standaloneEmbeddedAssetPlugin: BunPlugin = {
  name: "standalone-embedded-assets",
  setup(build) {
    build.onLoad(
      { filter: /\/standalone-embedded-assets\/[^/]+$/, namespace: "file" },
      async (args) => {
        return {
          contents: await Bun.file(args.path).bytes(),
          loader: "file",
        };
      },
    );
  },
};

//#endregion

//#region Main

await main();

async function main() {
  const commitSha = await getCommitSha();

  console.log(`🚧 Building Alumnium ${ALUMNIUM_VERSION}+${commitSha}...`);

  //#region Clean up

  await Promise.all([
    // Binaries
    BUILD_BIN && cleanUpDir(DIST_BIN_DIR),
    // npm
    cleanUpMatchingInDir(
      [
        BUILD_NPM_CLI && "alumnium-cli-*.tgz",
        ...BUILD_NPM_PKGS.map(
          ({ packageJson }) =>
            `${npmTarBaseName(packageJson.name)}-[0-9]*.[0-9]*.[0-9]*.tgz`,
        ),
      ],
      DIST_NPM_DIR,
    ),
    ...BUILD_NPM_PKGS.map((pkg) => cleanUpDir(getNpmPkgDir(pkg))),
    ...TARGET_PLATFORMS.flatMap(({ npm }) => BUILD_NPM_CLI && cleanUpPkg(npm)),
    // pip
    // NOTE: The main Python package is built into the same directory, so only
    // the CLI files are cleaned up.
    BUILD_PIP && cleanUpMatchingInDir(["alumnium_cli-*"], DIST_PIP_DIR),
    BUILD_PIP && cleanUpDir(DIST_PIP_CLI_PKG_DIR),
    ...TARGET_PLATFORMS.flatMap(({ pip }) => BUILD_PIP && cleanUpPkg(pip)),
    // maven
    BUILD_MAVEN && cleanUpDir(DIST_MAVEN_DIR),
    ...TARGET_PLATFORMS.flatMap(
      ({ maven }) => BUILD_MAVEN && cleanUpPkg(maven),
    ),
  ]);

  //#endregion

  //#region Binaries

  if (BUILD_BIN) {
    console.log("\n🌀 Building binaries:\n");

    const standaloneEmbeddedAssetPaths =
      await prepareStandaloneEmbeddedAssets();

    await Promise.all(
      TARGET_PLATFORMS.map(async ({ os, arch, target, binPath }) => {
        const result = await Bun.build({
          entrypoints: [BIN_SRC_PATH, ...standaloneEmbeddedAssetPaths],
          // NOTE: @cursor/sdk is external because its
          // webpack-chunked dist loads chunks dynamically
          // (`require("." + chunkId + ".js")`), which cannot be bundled into
          // a single-file executable — and its license does not permit
          // embedding it as an asset either. Compiled binaries download it
          // from the npm registry on first cursor-provider use and load it
          // from ~/.alumnium/vendor (src/standalone/installCursorSdk.ts).
          external: ["chromium-bidi", "electron", "@cursor/sdk"],
          compile: {
            target: getBunTarget(os, arch),
            outfile: binPath,
          },
          files: STUBBED_FILES,
          plugins: [
            telemetryPathsRewritePlugin,
            wdioUtilsPatcherPlugin,
            webdriverIOPatcherPlugin,
            standaloneEmbeddedAssetPlugin,
          ],
          define: {
            BUILD_COMMIT_SHA: JSON.stringify(commitSha),
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

    await fs.rm(TMP_DIR, { recursive: true, force: true });
  }

  //#endregion

  //#region npm

  if (BUILD_NPM_PKGS.length || BUILD_NPM_CLI) {
    console.log("\n🌀 Building npm packages...\n");

    const typesDir = BUILD_NPM_PKGS.length
      ? await buildNpmDeclarations()
      : undefined;

    await Promise.all([
      //#region npm-<workspace package>
      ...BUILD_NPM_PKGS.map((pkg) => buildNpmPkg(pkg, typesDir!)),
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

    if (typesDir) await fs.rm(typesDir, { recursive: true, force: true });

    // Workspace packages in dependency order for scripts/build/publish.sh. The main
    // package goes last, after the platform CLI packages it optionally
    // depends on.
    await fs.writeFile(
      NPM_PUBLISH_ORDER_PATH,
      PUBLISHED_PKGS.map(({ packageJson }) => packageJson.name)
        .filter((name) => name !== MAIN_NPM_PKG_NAME)
        .map((name) => `${npmTarBaseName(name)}-${ALUMNIUM_VERSION}.tgz\n`)
        .join(""),
    );
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

  //#region maven

  if (BUILD_MAVEN) {
    console.log("\n🌀 Building Maven packages...\n");

    await Promise.all(
      TARGET_PLATFORMS.map(async (platform) => {
        const { target, binName, maven } = platform;

        // Each platform gets its own resource namespace so multiple CLI JARs
        // can coexist on the classpath (e.g. darwin-arm64 + linux-x64).
        // BinaryResolver detects OS/arch to find the right binary.properties.
        const platformPrefix = `${MAVEN_RESOURCE_PREFIX}/${target}`;
        const binResourcePath = `${platformPrefix}/${binName}`;
        const metaInfDir = path.resolve(maven.dir, "META-INF");

        await Promise.all([
          buildTargetPkgCommons(platform, maven),
          fs.mkdir(metaInfDir, { recursive: true }),
        ]);

        await Promise.all([
          // README.md/LICENSE.md are staged at the package root by
          // buildTargetPkgCommons; move them under META-INF/ so they ship
          // inside the JAR per Maven convention.
          fs.rename(
            path.resolve(maven.dir, "LICENSE.md"),
            path.resolve(metaInfDir, "LICENSE.md"),
          ),
          fs.rename(
            path.resolve(maven.dir, "README.md"),
            path.resolve(metaInfDir, "README.md"),
          ),
          fs.writeFile(
            path.resolve(maven.dir, platformPrefix, "binary.properties"),
            `name=${binName}\nresource=${binResourcePath}\n`,
          ),
        ]);

        // Build JAR containing binary.properties, the binary, and META-INF docs
        const jarName = `${maven.name}-${ALUMNIUM_VERSION}.jar`;
        const jarPath = path.resolve(DIST_MAVEN_DIR, jarName);
        await $`jar cf ${jarPath} -C ${maven.dir} ${platformPrefix}/binary.properties -C ${maven.dir} ${binResourcePath} -C ${maven.dir} META-INF/LICENSE.md -C ${maven.dir} META-INF/README.md`;

        console.log(`🟢 ${maven.name} (${cwdRelPath(jarPath)})`);
      }),
    );
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
  const version = pipVersion(ALUMNIUM_VERSION);
  return `${name.replace(/-/g, "_")}-${version}-py3-none-${platformTag}.whl`;
}

// Pip and NPM has different rules for alpha versions. NPM allows hyphens (e.g. 0.20.0-alpha.1) while pip doesn't (it expects 0.20.0a1).
function pipVersion(version: string): string {
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
  const version = pipVersion(ALUMNIUM_VERSION);
  const pkgInfo = getPkgInfo(version);
  await $`VERSION=${version} PKG_INFO=${pkgInfo} BUILD_SUBSCRIPT=true ${path.join(import.meta.dirname, "build-pip-src.sh")}`;
}

function getPkgInfo(version: string): string {
  const authorNames = META_AUTHORS.map((a) => a.name).join(", ");
  const authorEmails = META_AUTHORS.map((a) => `${a.name} <${a.email}>`).join(
    ", ",
  );
  return [
    "Metadata-Version: 2.4",
    `Name: ${PIP_CLI_PKG_NAME}`,
    `Version: ${version}`,
    "Summary: Alumnium CLI",
    `Author: ${authorNames}`,
    `Author-email: ${authorEmails}`,
    "License-Expression: MIT",
    "Requires-Python: >=3.10, <4.0",
    "Project-URL: Documentation, https://alumnium.ai/docs/",
    "Project-URL: Homepage, https://alumnium.ai/",
    "Project-URL: Issues, https://github.com/alumnium-hq/alumnium/issues",
    "Project-URL: Repository, https://github.com/alumnium-hq/alumnium",
  ].join("\n");
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
  return path.resolve(
    DIST_NPM_DIR,
    `${npmTarBaseName(name)}-${ALUMNIUM_VERSION}.tgz`,
  );
}

// npm pack names scoped package tarballs `<scope>-<name>-<version>.tgz`.
function npmTarBaseName(name: string) {
  return name.replace(/^@/, "").replace("/", "-");
}

async function buildNpmPkg(pkg: WorkspacePkg, typesDir: string) {
  const { name } = pkg.packageJson;
  const dir = getNpmPkgDir(pkg);
  const isMain = name === MAIN_NPM_PKG_NAME;
  const entries = Object.entries(pkg.entries);
  if (!entries.length) throw new Error(`${name} has no published entries`);

  const problems = await checkWorkspacePkg(pkg, await inspectWorkspacePkg(pkg));
  if (problems.length) {
    throw new AggregateError(
      problems.map((problem) => new Error(problem)),
      `${name} violates npm package boundaries:\n${problems.join("\n")}`,
    );
  }

  const baseBuildConfig: Bun.BuildConfig = {
    root: pkg.dir,
    entrypoints: [],
    outdir: dir,
    sourcemap: true,
    target: "node",
    packages: "external",
    files: STUBBED_FILES,
  };

  const readmeMd = `# ${name}

${pkg.packageJson.description}. See [the main \`alumnium\` package page](https://www.npmjs.com/package/alumnium) for more details.
`;

  await Promise.all([
    ...entries.flatMap(([, entryPath]) =>
      (["esm", "cjs"] as const).map((format) => {
        const ext = format === "esm" ? ".js" : ".cjs";
        return Bun.build({
          ...baseBuildConfig,
          entrypoints: [entryPath],
          format,
          plugins: [
            telemetryPathsRewritePlugin,
            siblingEntriesExternalPlugin(pkg, entryPath, ext),
            ...(format === "cjs" ? [cjsFilenamifyPlugin] : []),
          ],
          naming: `[dir]/[name]${ext}`,
        });
      }),
    ),

    isMain &&
      Bun.build({
        ...baseBuildConfig,
        entrypoints: [path.join(pkg.dir, MAIN_NPM_BIN_WRAPPER_PATH)],
        format: "esm",
      }),

    copyNpmDeclarations(pkg, typesDir, dir),

    copyAssets(isMain ? CORE_PKG_ASSETS : COMMON_PKG_ASSETS, dir),

    !isMain && fs.writeFile(path.join(dir, "README.md"), readmeMd),
  ]);

  const mainPackageJson = PUBLISHED_PKGS.find(
    (pkg) => pkg.packageJson.name === MAIN_NPM_PKG_NAME,
  )?.packageJson;
  const {
    devDependencies: _devDependencies,
    dependencies = {},
    ...packageJson
  } = pkg.packageJson;
  const distPackageJson: Record<string, unknown> = {
    license: mainPackageJson?.license,
    author: mainPackageJson?.author,
    contributors: mainPackageJson?.contributors,
    repository: mainPackageJson?.repository,
    ...packageJson,
    version: ALUMNIUM_VERSION,
    files: ["src", "README.md", "LICENSE.md"],
    exports: Object.fromEntries(
      entries.map(([subpath, entryPath]) => {
        const basePath = `./${path.relative(pkg.dir, entryPath).replace(/\.ts$/, "")}`;
        return [
          subpath,
          {
            // NOTE: Both conditions share ESM types, which TypeScript
            // supports for require() of ESM.
            import: { types: `${basePath}.d.ts`, default: `${basePath}.js` },
            require: { types: `${basePath}.d.ts`, default: `${basePath}.cjs` },
          },
        ];
      }),
    ),
    // Workspace packages are released together and pinned exactly.
    dependencies: Object.fromEntries(
      Object.entries(dependencies).map(([dep, version]) => [
        dep,
        version.startsWith("workspace:") ? ALUMNIUM_VERSION : version,
      ]),
    ),
  };

  if (isMain) {
    distPackageJson.bin = {
      alumnium: `./${MAIN_NPM_BIN_WRAPPER_PATH.replace(/\.ts$/, ".js")}`,
    };
    distPackageJson.optionalDependencies = Object.fromEntries(
      TARGET_PLATFORMS.map(({ npm }) => [npm.name, ALUMNIUM_VERSION]),
    );
  }

  await fs.writeFile(
    path.join(dir, PACKAGE_JSON_NAME),
    JSON.stringify(distPackageJson, null, 2),
  );

  await finalizeNpm(dir);

  const tarPath = await buildNpmTar(name, dir);

  console.log(`🟢 ${name} (${cwdRelPath(dir)} / ${cwdRelPath(tarPath)})`);
}

// Emits declarations of all workspace packages at once, so cross-package
// imports keep their package specifiers.
async function buildNpmDeclarations() {
  const typesDir = path.join(TMP_DIR, "npm-types");
  await cleanUpDir(typesDir);
  await $`bun tsc --project ${TSCONFIG_BUILD_PATH} --outDir ${typesDir}`.cwd(
    PKG_DIR,
  );
  return typesDir;
}

async function copyNpmDeclarations(
  pkg: WorkspacePkg,
  typesDir: string,
  dir: string,
) {
  const pkgTypesDir = path.join(typesDir, pkg.dirName);
  const declPaths = await Array.fromAsync(
    new Bun.Glob("**/*.d.ts").scan(pkgTypesDir),
  );
  await Promise.all(
    declPaths.map(async (declPath) => {
      const distDeclPath = path.join(dir, declPath);
      await fs.mkdir(path.dirname(distDeclPath), { recursive: true });
      await fs.copyFile(path.join(pkgTypesDir, declPath), distDeclPath);
    }),
  );
}

function getNpmPkgDir(pkg: WorkspacePkg) {
  return path.resolve(DIST_DIR, `npm-${pkg.dirName}`);
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
  return $`bun oxfmt **/*`.cwd(dir).quiet();
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
          return "macosx_10_9_x86_64";
        case "arm64":
          return "macosx_11_0_arm64";
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

async function getCommitSha(): Promise<string> {
  const [revParse, status] = await Promise.all([
    $`git rev-parse --short HEAD`.cwd(REPO_ROOT_DIR).quiet().text(),
    $`git status --porcelain`.cwd(REPO_ROOT_DIR).quiet().text(),
  ]);

  const sha = revParse.trim();
  always(sha);

  return status.trim() ? `${sha}-dirty` : sha;
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
      async (pattern) =>
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

async function prepareStandaloneEmbeddedAssets() {
  await cleanUpDir(STANDALONE_EMBEDDED_ASSETS_DIR);

  const [assets, oopDownloadPath] = await Promise.all([
    getStandaloneEmbeddedAssets(),
    buildPlaywrightOopDownloadBundle(),
  ]);

  const allAssets: StandaloneEmbeddedAsset[] = [
    ...assets,
    {
      name: PLAYWRIGHT_CORE_OOP_DOWNLOAD_ASSET_NAME,
      sourcePath: oopDownloadPath,
    },
  ];

  return Promise.all(
    allAssets.map(async ({ name, sourcePath }) => {
      const stagedPath = path.join(STANDALONE_EMBEDDED_ASSETS_DIR, name);
      await fs.copyFile(sourcePath, stagedPath);
      return stagedPath;
    }),
  );
}

async function buildPlaywrightOopDownloadBundle(): Promise<string> {
  const playwrightCorePkgDir = path.resolve(
    PKG_DIR,
    "node_modules/playwright-core",
  );
  const entrypoint = path.join(
    playwrightCorePkgDir,
    "lib/entry/oopBrowserDownload.js",
  );
  const outDir = path.resolve(TMP_DIR, "playwright-oop-download");
  await cleanUpDir(outDir);

  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: outDir,
    target: "node",
    format: "cjs",
    packages: "bundle",
    external: ["chromium-bidi"],
    naming: "[name].cjs",
    minify: false,
    banner: PLAYWRIGHT_OOP_DOWNLOAD_BANNER,
  });

  if (!result.success) {
    throw new AggregateError(
      result.logs.map((log) => new Error(log.message)),
      "Failed to bundle playwright oopDownloadBrowserMain.js",
    );
  }

  return path.join(outDir, "oopBrowserDownload.cjs");
}

async function getStandaloneEmbeddedAssets(): Promise<
  StandaloneEmbeddedAsset[]
> {
  const seleniumPkgDir = path.resolve(
    PKG_DIR,
    "node_modules/selenium-webdriver",
  );
  const playwrightCorePkgDir = path.resolve(
    PKG_DIR,
    "node_modules/playwright-core",
  );

  const seleniumAtomPaths = await Array.fromAsync(
    new Bun.Glob(path.join(seleniumPkgDir, "lib/atoms/*.js")).scan("/"),
  );

  return [
    ...seleniumAtomPaths.sort().map((sourcePath) => ({
      name: `${SELENIUM_ATOM_ASSET_PREFIX}${path.basename(sourcePath)}`,
      sourcePath,
    })),

    {
      name: SELENIUM_MANAGER_ASSET_NAMES.linux,
      sourcePath: path.join(seleniumPkgDir, "bin/linux/selenium-manager"),
    },
    {
      name: SELENIUM_MANAGER_ASSET_NAMES.macos,
      sourcePath: path.join(seleniumPkgDir, "bin/macos/selenium-manager"),
    },
    {
      name: SELENIUM_MANAGER_ASSET_NAMES.windows,
      sourcePath: path.join(seleniumPkgDir, "bin/windows/selenium-manager.exe"),
    },

    {
      name: PLAYWRIGHT_CORE_PACKAGE_JSON_ASSET_NAME,
      sourcePath: path.join(playwrightCorePkgDir, "package.json"),
    },

    {
      name: PLAYWRIGHT_CORE_BROWSERS_JSON_ASSET_NAME,
      sourcePath: path.join(playwrightCorePkgDir, "browsers.json"),
    },
  ];
}

//#endregion
