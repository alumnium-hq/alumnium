import { embeddedFiles } from "bun";
import fs from "node:fs/promises";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { isSingleFileExecutable } from "../bundle.ts";
import {
  PLAYWRIGHT_CORE_PACKAGE_JSON_ASSET_NAME,
  SELENIUM_ATOM_ASSET_PREFIX,
  SELENIUM_MANAGER_ASSET_NAMES,
} from "./embeddedAssetNames.ts";

const EMBEDDED_FILE_HASH_RE = /-[a-z0-9]{8,}(?=(?:\.[^.]+)?\.?$)/;

const RUNTIME_SELENIUM_MANAGER_TARGETS = {
  darwin: {
    assetName: SELENIUM_MANAGER_ASSET_NAMES.macos,
    dirName: "macos",
    fileName: "selenium-manager",
  },
  linux: {
    assetName: SELENIUM_MANAGER_ASSET_NAMES.linux,
    dirName: "linux",
    fileName: "selenium-manager",
  },
  win32: {
    assetName: SELENIUM_MANAGER_ASSET_NAMES.windows,
    dirName: "windows",
    fileName: "selenium-manager.exe",
  },
} as const;

interface ExtractedEmbeddedDependencies {
  playwrightPackageJsonPath: string;
  seleniumAtomsDir: string;
  seleniumManagerPath: string | undefined;
}

interface EmbeddedFile extends Blob {
  name: string;
}

let setupPromise: Promise<void> | undefined;
let resolveHookInstalled = false;

export function setupEmbeddedDependencies() {
  setupPromise ??= setupEmbeddedDependenciesInternal();
  return setupPromise;
}

async function setupEmbeddedDependenciesInternal() {
  if (!isSingleFileExecutable()) return;

  const paths = await extractEmbeddedDependencies();

  if (paths.seleniumManagerPath) {
    process.env.SE_MANAGER_PATH ??= paths.seleniumManagerPath;
  }

  installResolveHook(paths);
}

async function extractEmbeddedDependencies(): Promise<ExtractedEmbeddedDependencies> {
  const extractedDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "alumnium-embedded-deps-"),
  );

  const seleniumAtomsDir = path.join(
    extractedDir,
    "selenium-webdriver",
    "lib",
    "atoms",
  );
  const playwrightPackageJsonPath = path.join(
    extractedDir,
    "playwright-core",
    "package.json",
  );

  await Promise.all([
    fs.mkdir(seleniumAtomsDir, { recursive: true }),
    fs.mkdir(path.dirname(playwrightPackageJsonPath), { recursive: true }),
  ]);

  const filesByName = getEmbeddedFilesByName();

  await writeEmbeddedFile(
    filesByName,
    PLAYWRIGHT_CORE_PACKAGE_JSON_ASSET_NAME,
    playwrightPackageJsonPath,
  );

  const seleniumAtomNames = Object.keys(filesByName)
    .filter((name) => name.startsWith(SELENIUM_ATOM_ASSET_PREFIX))
    .sort();

  await Promise.all(
    seleniumAtomNames.map((name) =>
      writeEmbeddedFile(
        filesByName,
        name,
        path.join(
          seleniumAtomsDir,
          name.slice(SELENIUM_ATOM_ASSET_PREFIX.length),
        ),
      ),
    ),
  );

  const seleniumManagerPath = await extractSeleniumManager(
    filesByName,
    extractedDir,
  );

  return {
    playwrightPackageJsonPath,
    seleniumAtomsDir,
    seleniumManagerPath,
  };
}

async function extractSeleniumManager(
  filesByName: Record<string, Blob>,
  extractedDir: string,
) {
  const target =
    process.platform in RUNTIME_SELENIUM_MANAGER_TARGETS
      ? RUNTIME_SELENIUM_MANAGER_TARGETS[
          process.platform as keyof typeof RUNTIME_SELENIUM_MANAGER_TARGETS
        ]
      : undefined;

  if (!target) return;

  const targetPath = path.join(
    extractedDir,
    "selenium-webdriver",
    "bin",
    target.dirName,
    target.fileName,
  );

  await writeEmbeddedFile(filesByName, target.assetName, targetPath, 0o755);

  return targetPath;
}

function installResolveHook(paths: ExtractedEmbeddedDependencies) {
  if (resolveHookInstalled) return;

  const moduleWithResolveFilename = Module as typeof Module & {
    _resolveFilename(...args: unknown[]): string;
  };

  const resolveFilename = moduleWithResolveFilename._resolveFilename;

  moduleWithResolveFilename._resolveFilename = function (...args: unknown[]) {
    const [request] = args;

    if (typeof request === "string") {
      if (request.startsWith("./atoms/")) {
        return path.join(
          paths.seleniumAtomsDir,
          request.slice("./atoms/".length),
        );
      }

      if (request === "../../../package.json") {
        return paths.playwrightPackageJsonPath;
      }

      if (
        request.endsWith("/playwright-core/package.json") ||
        request.endsWith("\\playwright-core\\package.json")
      ) {
        return paths.playwrightPackageJsonPath;
      }
    }

    return resolveFilename.call(this, ...args);
  };

  resolveHookInstalled = true;
}

function getEmbeddedFilesByName() {
  return Object.fromEntries(
    (embeddedFiles as EmbeddedFile[]).map((file) => [
      normalizeEmbeddedFileName(file.name),
      file,
    ]),
  );
}

function normalizeEmbeddedFileName(fileName: string) {
  return fileName.replace(EMBEDDED_FILE_HASH_RE, "").replace(/\.$/, "");
}

async function writeEmbeddedFile(
  filesByName: Record<string, Blob>,
  embeddedFileName: string,
  targetPath: string,
  mode?: number,
) {
  const file = filesByName[embeddedFileName];

  if (!file) {
    throw new Error(`Missing embedded dependency asset: ${embeddedFileName}`);
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, await file.bytes());

  if (mode) {
    await fs.chmod(targetPath, mode);
  }
}
