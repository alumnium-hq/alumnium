// Auto-installs Playwright browsers (Chromium + FFmpeg) on first use.
//
// In dev mode `installBrowsersForNpmInstall` works as-is because all
// node_modules are on disk. In the compiled Bun single-file binary it needs
// extra wiring: playwright-core downloads browsers by forking itself via
// child_process.fork to run oopDownloadBrowserMain.js. That script lives
// inside $bunfs and its relative imports (manualPromise, network, zipBundle,
// fileUtils) aren't available on disk. To fix this we:
//
//   1. Pre-bundle oopDownloadBrowserMain.js at Alumnium build time into a
//      self-contained CJS file with all imports inlined (scripts/build.ts).
//   2. Embed the bundle as an asset and extract it to a temp dir at runtime
//      (setupEmbeddedDependencies.ts).
//   3. Monkey-patch child_process.fork to redirect calls targeting
//      oopDownloadBrowserMain.js to the extracted bundle.
//   4. Set BUN_BE_BUN=1 on the fork so process.execPath (the alumnium binary)
//      behaves as the Bun CLI and can execute the script.
//
// The patch is applied only while installBrowsersForNpmInstall is running and
// removed immediately after, leaving fork unmodified for all other callers.
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Logger } from "../telemetry/Logger.ts";
import { isSingleFileExecutable } from "../bundle.ts";

const logger = Logger.get(import.meta.url);

let installPromise: Promise<void> | undefined;

// Memoize the promise so concurrent `start` tool calls don't race each other
// into parallel downloads. The promise is cleared on failure so the next call
// can retry.
export function ensurePlaywrightChromiumInstalled(): Promise<void> {
  installPromise ??= installChromiumIfNeeded().catch((err) => {
    installPromise = undefined;
    throw err;
  });
  return installPromise;
}

async function installChromiumIfNeeded() {
  // String literal dynamic import so Bun bundles playwright-core's registry
  // at build time from alumnium's own node_modules. A variable import()
  // is not bundled and fails at runtime in the binary with "Module not found".
  //
  // playwright-core/lib/server/registry/index is the same module that backs
  // `npx playwright install`. It reads browser revision info from
  // playwright-core's own package.json, which in the single-file binary is
  // redirected to the embedded copy via the _resolveFilename hook in
  // setupEmbeddedDependencies.ts, so the downloaded browser always matches
  // the bundled runtime exactly.
  //
  // The import is lazy (inside this function, not at module top level) so the
  // _resolveFilename hook is already installed before the registry module loads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { registry, installBrowsersForNpmInstall } = (await import(
    // @ts-expect-error — internal path, no type declarations
    "playwright-core/lib/server/registry/index"
  )) as any;

  const chromiumExecutable = registry.findExecutable("chromium");
  const chromiumHeadlessShellExecutable = registry.findExecutable(
    "chromium-headless-shell",
  );
  const ffmpegExecutable = registry.findExecutable("ffmpeg");

  const [chromiumInstalled, chromiumHeadlessShellInstalled, ffmpegInstalled] = [
    isExeInstalled(chromiumExecutable),
    isExeInstalled(chromiumHeadlessShellExecutable),
    isExeInstalled(ffmpegExecutable),
  ];

  // Skip install only if every executable is already present on disk.
  // All three must exist — otherwise we run the full install so that e.g.
  // ffmpeg is not skipped when chromium is already there.
  if (chromiumInstalled && chromiumHeadlessShellInstalled && ffmpegInstalled) {
    logger.debug("Playwright browsers already installed");
    return;
  }

  logger.info("Playwright chromium not found, installing...");

  let restoreFork: (() => void) | undefined;
  if (isSingleFileExecutable()) {
    // Dynamic import keeps the `bun`-dependent module out of the vitest
    // environment, which runs under Node and has no `bun` package.
    const { setupEmbeddedDependencies, getExtractedPlaywrightOopDownloadPath } =
      await import("./setupEmbeddedDependencies.ts");
    await setupEmbeddedDependencies();
    const oopDownloadPath = getExtractedPlaywrightOopDownloadPath();
    if (!oopDownloadPath) {
      throw new Error(
        "Embedded Playwright download worker missing — please raise an issue at https://github.com/alumnium-hq/alumnium/issues.",
      );
    }
    restoreFork = patchForkForOopDownload(oopDownloadPath);
  }

  try {
    // ffmpeg is required for video recording (recordVideo is always enabled).
    // chromium-headless-shell is used when headless mode is active.
    await installBrowsersForNpmInstall([
      "chromium",
      "chromium-headless-shell",
      "ffmpeg",
    ]);
  } finally {
    restoreFork?.();
  }

  // Install system dependencies (shared libs, etc). Equivalent to
  // `--with-deps`. Requires elevated privileges on Linux, so we swallow errors
  // rather than failing the whole start call.
  try {
    await registry.installDeps(
      [chromiumExecutable, chromiumHeadlessShellExecutable, ffmpegExecutable],
      false,
    );
  } catch (err) {
    logger.warn("Could not install Playwright system dependencies: {err}", {
      err,
    });
  }

  logger.info("Playwright Chromium installed successfully");
}

function isExeInstalled(executable: any): boolean {
  const path = executable?.executablePath();
  return path !== undefined && fs.existsSync(path);
}

// Redirects child_process.fork calls targeting oopDownloadBrowserMain.js (or .cjs)
// to the pre-bundled self-contained CJS file extracted from the binary's assets.
// BUN_BE_BUN=1 makes process.execPath (the alumnium binary) behave as the Bun CLI.
function patchForkForOopDownload(extractedPath: string) {
  const originalFork = childProcess.fork.bind(childProcess);

  // @ts-expect-error — monkey-patching a built-in
  childProcess.fork = (
    modulePath: string,
    args?: readonly string[],
    options?: childProcess.ForkOptions,
  ) => {
    const basename = path.basename(String(modulePath));
    if (
      basename !== "oopDownloadBrowserMain.js" &&
      basename !== "oopDownloadBrowserMain.cjs"
    ) {
      return originalFork(modulePath, args as string[], options);
    }

    logger.debug(
      "Redirecting playwright fork to bundled worker: {extractedPath}",
      {
        extractedPath,
      },
    );

    return originalFork(extractedPath, args as string[], {
      ...options,
      execPath: process.execPath,
      env: { ...(options?.env ?? process.env), BUN_BE_BUN: "1" },
    });
  };

  return () => {
    childProcess.fork = originalFork as typeof childProcess.fork;
  };
}
