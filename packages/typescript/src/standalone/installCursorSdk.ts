// Downloads the Cursor SDK on first use in the compiled single-file binary.
//
// @cursor/sdk cannot be bundled (its webpack-chunked dist loads chunks with
// dynamic requires) and cannot be embedded like the Selenium atoms (its
// license does not permit redistribution). Instead the binary vendors it the
// way Playwright browsers are handled: on the first cursor-provider call the
// locked dependency closure (src/standalone/cursorSdkVendorManifest.ts) is
// fetched from registry.npmjs.org into ~/.alumnium/vendor, verified against
// the lockfile's sha512 integrity, and loaded with createRequire plus the
// parent-scoped bare-specifier hook from cursorSdkResolver.ts.
import type { CursorSdkModule } from "langchain-cursor";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { Env } from "../Env.ts";
import { Logger } from "../telemetry/Logger.ts";
import { retry } from "../utils/retry.ts";
import {
  CURSOR_SDK_PACKAGE_NAME,
  type CursorSdkVendorManifest,
  type CursorSdkVendorPackage,
} from "./cursorSdkManifest.ts";
import {
  installVendorResolveHook,
  resolvePackageEntry,
} from "./cursorSdkResolver.ts";
import { cursorSdkVendorManifest } from "./cursorSdkVendorManifest.ts";
import { untarInto } from "./untar.ts";

const logger = Logger.get(import.meta.url);

const MARKER_FILENAME = ".alumnium-complete";
const STALE_PARTIAL_AGE_MS = 24 * 60 * 60 * 1000;

let loadPromise: Promise<CursorSdkModule> | undefined;

// Memoize the promise so concurrent cursor calls don't race each other into
// parallel downloads; cleared on failure so the next call can retry.
export function loadVendoredCursorSdk(): Promise<CursorSdkModule> {
  loadPromise ??= loadVendoredCursorSdkInternal().catch((error) => {
    loadPromise = undefined;
    throw error;
  });
  return loadPromise;
}

async function loadVendoredCursorSdkInternal(): Promise<CursorSdkModule> {
  const manifest = cursorSdkVendorManifest;

  const explicitDir = Env.ALUMNIUM_CURSOR_SDK_DIR;
  let vendorRoot: string;
  if (explicitDir) {
    vendorRoot = path.resolve(explicitDir);
    await assertExplicitVendorDir(vendorRoot, manifest);
  } else {
    vendorRoot = path.join(
      os.homedir(),
      ".alumnium",
      "vendor",
      "cursor-sdk",
      manifest.sdkVersion,
    );
    await ensureVendorTree(manifest, vendorRoot);
  }

  return loadSdkFromVendorRoot(manifest, vendorRoot);
}

/**
 * Makes sure vendorRoot holds the complete manifest closure, downloading it
 * from the npm registry if needed. Installation is atomic: everything is
 * extracted into a sibling partial directory that is renamed into place only
 * after the completion marker is written, so a directory without the marker
 * is always a leftover from a crash and safe to delete.
 */
export async function ensureVendorTree(
  manifest: CursorSdkVendorManifest,
  vendorRoot: string,
): Promise<void> {
  const markerPath = path.join(vendorRoot, MARKER_FILENAME);
  if (await pathExists(markerPath)) return;
  await fs.rm(vendorRoot, { recursive: true, force: true });

  const packages = packagesForPlatform(manifest);
  logger.info(
    `Downloading the Cursor SDK (~24 MB, one time) from registry.npmjs.org into ${vendorRoot}`,
  );

  const partialDir = `${vendorRoot}.partial-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    for (const pkg of packages) {
      try {
        await retry({ maxAttempts: 3, backOff: 500 }, () =>
          downloadAndExtract(pkg, partialDir),
        );
      } catch (error) {
        throw new Error(
          `Failed to download Cursor SDK package ${pkg.name}@${pkg.version} from registry.npmjs.org: ` +
            `${error instanceof Error ? error.message : String(error)}. ` +
            "The Cursor provider performs a one-time ~24 MB download on first use. " +
            "Check network/proxy settings (HTTPS_PROXY is honored), or point " +
            "ALUMNIUM_CURSOR_SDK_DIR at a pre-installed node_modules tree.",
          { cause: error },
        );
      }
    }

    await fs.writeFile(
      path.join(partialDir, MARKER_FILENAME),
      JSON.stringify(
        {
          sdkVersion: manifest.sdkVersion,
          installedAt: new Date().toISOString(),
          platform: `${process.platform}-${process.arch}`,
        },
        null,
        2,
      ),
    );
    await promoteToVendorRoot(partialDir, markerPath, vendorRoot);
  } finally {
    await fs.rm(partialDir, { recursive: true, force: true }).catch(() => {});
    await sweepStalePartials(vendorRoot);
  }
}

/**
 * The manifest-closure packages relevant on this machine: everything
 * unrestricted, plus the ripgrep package matching the current platform.
 * Windows-on-ARM falls back to the x64 ripgrep (emulation runs it fine); if
 * no package matches, the SDK degrades gracefully without ripgrep.
 */
export function packagesForPlatform(
  manifest: CursorSdkVendorManifest,
  platform: string = process.platform,
  arch: string = process.arch,
): CursorSdkVendorPackage[] {
  const [universal, platformSpecific] = manifest.packages.reduce<
    [CursorSdkVendorPackage[], CursorSdkVendorPackage[]]
  >(
    ([plain, restricted], pkg) => {
      (pkg.os || pkg.cpu ? restricted : plain).push(pkg);
      return [plain, restricted];
    },
    [[], []],
  );

  const ripgrep =
    platformSpecific.find((pkg) => pkg.os === platform && pkg.cpu === arch) ??
    (platform === "win32"
      ? platformSpecific.find((pkg) => pkg.os === "win32" && pkg.cpu === "x64")
      : undefined);

  if (!ripgrep) {
    logger.warn(
      `No Cursor ripgrep package for ${platform}-${arch}; Cursor agent file-search tools may be unavailable.`,
    );
    return universal;
  }
  return [...universal, ripgrep];
}

async function downloadAndExtract(
  pkg: CursorSdkVendorPackage,
  partialDir: string,
): Promise<void> {
  const basename = pkg.name.split("/").pop() as string;
  const url = `https://registry.npmjs.org/${pkg.name}/-/${basename}-${pkg.version}.tgz`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  const tgzBytes = new Uint8Array(await response.arrayBuffer());

  const digest = createHash("sha512").update(tgzBytes).digest("base64");
  const expected = pkg.integrity.slice("sha512-".length);
  if (digest !== expected) {
    throw new Error(
      `Integrity check failed for ${pkg.name}@${pkg.version} (expected sha512-${expected}, got sha512-${digest}) — ` +
        "the download may be corrupted or tampered with; report at " +
        "https://github.com/alumnium-hq/alumnium/issues if it persists",
    );
  }

  await untarInto(
    gunzipSync(tgzBytes),
    path.join(partialDir, "node_modules", pkg.name),
  );
}

async function promoteToVendorRoot(
  partialDir: string,
  markerPath: string,
  vendorRoot: string,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rename(partialDir, vendorRoot);
      return;
    } catch (error) {
      // Another process may have completed the same install first; their
      // tree is as good as ours. Otherwise retry briefly (Windows AV scans
      // hold locks) before giving up.
      if (await pathExists(markerPath)) return;
      if (attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }
}

async function sweepStalePartials(vendorRoot: string): Promise<void> {
  try {
    const parentDir = path.dirname(vendorRoot);
    const prefix = `${path.basename(vendorRoot)}.partial-`;
    for (const entry of await fs.readdir(parentDir)) {
      if (!entry.startsWith(prefix)) continue;
      const entryPath = path.join(parentDir, entry);
      const { mtimeMs } = await fs.stat(entryPath);
      if (Date.now() - mtimeMs > STALE_PARTIAL_AGE_MS) {
        await fs.rm(entryPath, { recursive: true, force: true });
      }
    }
  } catch {
    // Best-effort cleanup of other processes' leftovers.
  }
}

async function assertExplicitVendorDir(
  vendorRoot: string,
  manifest: CursorSdkVendorManifest,
): Promise<void> {
  const manifestPath = path.join(
    vendorRoot,
    "node_modules",
    CURSOR_SDK_PACKAGE_NAME,
    "package.json",
  );

  let installedVersion: string | undefined;
  try {
    installedVersion = (
      JSON.parse(await fs.readFile(manifestPath, "utf-8")) as {
        version?: string;
      }
    ).version;
  } catch (error) {
    throw new Error(
      `ALUMNIUM_CURSOR_SDK_DIR is set to ${vendorRoot} but ${manifestPath} cannot be read`,
      { cause: error },
    );
  }

  if (installedVersion !== manifest.sdkVersion) {
    logger.warn(
      `ALUMNIUM_CURSOR_SDK_DIR holds @cursor/sdk@${installedVersion}, but this Alumnium build expects ${manifest.sdkVersion}`,
    );
  }
}

/**
 * Loads the vendored SDK: installs the bare-specifier hook, points the SDK
 * at its ripgrep binary (it probes CURSOR_RIPGREP_PATH first — its own
 * node_modules walk cannot find our vendor tree), and requires the CJS entry
 * by absolute path.
 */
export async function loadSdkFromVendorRoot(
  manifest: CursorSdkVendorManifest,
  vendorRoot: string,
): Promise<CursorSdkModule> {
  const vendorNodeModules = path.join(vendorRoot, "node_modules");

  installVendorResolveHook(
    vendorRoot,
    new Set(manifest.packages.map((pkg) => pkg.name)),
  );

  const ripgrep = packagesForPlatform(manifest).find((pkg) => pkg.bin);
  const ripgrepRelPath =
    ripgrep?.bin?.rg ?? Object.values(ripgrep?.bin ?? {})[0];
  if (ripgrep && ripgrepRelPath) {
    const ripgrepPath = path.join(
      vendorNodeModules,
      ripgrep.name,
      ripgrepRelPath,
    );
    if (await pathExists(ripgrepPath)) {
      if (process.platform !== "win32") await fs.chmod(ripgrepPath, 0o755);
      // oxlint-disable-next-line no-process-env -- The SDK locates ripgrep through this variable
      process.env.CURSOR_RIPGREP_PATH ??= ripgrepPath;
    }
  }

  const entryPath = resolvePackageEntry(
    vendorNodeModules,
    CURSOR_SDK_PACKAGE_NAME,
    ".",
  );
  if (!entryPath) {
    throw new Error(
      `Vendored Cursor SDK at ${vendorRoot} is missing or unreadable; delete the directory to reinstall`,
    );
  }

  const requireFromVendor = createRequire(
    path.join(vendorNodeModules, CURSOR_SDK_PACKAGE_NAME, "package.json"),
  );
  return requireFromVendor(entryPath) as CursorSdkModule;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
