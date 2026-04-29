import fs from "node:fs";
import { createRequire } from "node:module";
import { getLogger } from "../utils/logger.ts";

const logger = getLogger(import.meta.url);

// Dynamic require is intentional: playwright-core/lib/server/registry/index has
// no shipped type declarations, so a static import would require manually
// maintaining ambient types. More importantly, when running as a compiled binary
// the Module._resolveFilename hook installed by setupEmbeddedDependencies.ts
// redirects playwright-core/package.json reads to the embedded copy extracted
// at startup. That hook must be in place before this module is evaluated, but
// the hook is only guaranteed to run if this code is called lazily (on first
// driver creation) rather than at module load time.
const require = createRequire(import.meta.url);

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
  // playwright-core/lib/server/registry/index is the same module that backs
  // `npx playwright install`. Because it reads revision info from
  // playwright-core's own package.json (redirected to the embedded copy in
  // the single-file binary), the browser it downloads always matches the
  // bundled runtime exactly — something `npx playwright install` from the
  // user's shell cannot guarantee.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { registry, installBrowsersForNpmInstall } =
    require("playwright-core/lib/server/registry/index") as any;

  const executable = registry.findExecutable("chromium")?.executablePath();
  if (executable && fs.existsSync(executable)) {
    logger.debug("Playwright chromium already installed at {executable}", {
      executable,
    });
    return;
  }

  logger.info("Playwright chromium not found, installing...");
  await installBrowsersForNpmInstall(["chromium"]);

  logger.info("Playwright chromium installed successfully");
}
