// Computes the set of npm packages the Cursor SDK needs at runtime by
// walking the repo lockfile from @cursor/sdk. The result is committed as
// cursorSdkVendorManifest.ts (via scripts/generate-bundles.ts) and drives
// the download-on-first-use install in installCursorSdk.ts — the compiled
// binary cannot bundle or redistribute the SDK (webpack-chunked dist,
// proprietary license), so it vendors exactly the locked closure instead.

export interface CursorSdkVendorPackage {
  name: string;
  version: string;
  /** npm integrity string ("sha512-<base64>") used to verify the tarball. */
  integrity: string;
  /** Platform restriction of optional platform packages (process.platform). */
  os?: string;
  /** CPU restriction of optional platform packages (process.arch). */
  cpu?: string;
  /** Executables the package ships, relative to its root (e.g. bin/rg). */
  bin?: Record<string, string>;
}

export interface CursorSdkVendorManifest {
  sdkVersion: string;
  packages: CursorSdkVendorPackage[];
}

export const CURSOR_SDK_PACKAGE_NAME = "@cursor/sdk";

interface LockEntry {
  name: string;
  version: string;
  integrity?: string;
  os?: string;
  cpu?: string;
  bin?: Record<string, string>;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
}

export function computeCursorSdkManifest(
  lock: unknown,
): CursorSdkVendorManifest {
  const lockPackages = extractLockPackages(lock);

  if (!(CURSOR_SDK_PACKAGE_NAME in lockPackages)) {
    throw new Error(
      `Lockfile has no "${CURSOR_SDK_PACKAGE_NAME}" entry — is the package installed?`,
    );
  }

  const collected = new Map<string, CursorSdkVendorPackage>();
  const visitedKeys = new Set<string>();
  // Each queue item is the nesting chain of package names that forms the
  // package's lockfile key (bun.lock scopes conflicting resolutions under
  // "<parentKey>/<depName>" keys, mirroring node_modules nesting).
  const queue: string[][] = [[CURSOR_SDK_PACKAGE_NAME]];

  while (queue.length) {
    const chain = queue.shift() as string[];
    const key = chain.join("/");
    if (visitedKeys.has(key)) continue;
    visitedKeys.add(key);

    const entry = parseLockEntry(key, lockPackages[key]);
    collectPackage(collected, key, entry);

    for (const [depNames, optional] of [
      [Object.keys(entry.dependencies), false],
      [Object.keys(entry.peerDependencies), false],
      [Object.keys(entry.optionalDependencies), true],
    ] as const) {
      for (const depName of depNames) {
        const depChain = resolveDependencyKey(lockPackages, chain, depName);
        if (depChain) {
          queue.push(depChain);
        } else if (!optional) {
          throw new Error(
            `Lockfile entry for dependency "${depName}" of "${key}" not found`,
          );
        }
      }
    }
  }

  const sdkVersion = findSdkVersion(collected);
  const packages = [...collected.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  assertClosureSanity(packages);

  return { sdkVersion, packages };
}

function extractLockPackages(lock: unknown): Record<string, unknown> {
  if (
    typeof lock !== "object" ||
    lock === null ||
    !("packages" in lock) ||
    typeof lock.packages !== "object" ||
    lock.packages === null
  ) {
    throw new Error('Lockfile has no "packages" object');
  }
  return lock.packages as Record<string, unknown>;
}

// bun.lock entry: ["name@version", "<registry>", { deps/os/cpu/bin }?, "sha512-…"?]
// (workspace/file entries have fewer elements and no integrity).
function parseLockEntry(key: string, raw: unknown): LockEntry {
  if (!Array.isArray(raw) || typeof raw[0] !== "string") {
    throw new Error(`Malformed lockfile entry for "${key}"`);
  }

  const nameAtVersion = raw[0];
  const separator = nameAtVersion.lastIndexOf("@");
  if (separator <= 0) {
    throw new Error(`Malformed lockfile entry name for "${key}"`);
  }

  const meta = raw.find(
    (element): element is Record<string, unknown> =>
      typeof element === "object" && element !== null,
  );
  const last = raw[raw.length - 1];
  const integrity =
    typeof last === "string" && last.startsWith("sha") ? last : undefined;

  return {
    name: nameAtVersion.slice(0, separator),
    version: nameAtVersion.slice(separator + 1),
    ...(integrity === undefined ? {} : { integrity }),
    ...(typeof meta?.os === "string" ? { os: meta.os } : {}),
    ...(typeof meta?.cpu === "string" ? { cpu: meta.cpu } : {}),
    ...(typeof meta?.bin === "object" && meta.bin !== null
      ? { bin: meta.bin as Record<string, string> }
      : {}),
    dependencies: asRecord(meta?.dependencies),
    peerDependencies: asRecord(meta?.peerDependencies),
    optionalDependencies: asRecord(meta?.optionalDependencies),
  };
}

function asRecord(value: unknown): Record<string, string> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, string>)
    : {};
}

// Resolves where the lockfile records depName for a package nested at
// `chain`: first under the package itself, then under each ancestor, then
// hoisted at the top level — the same shadowing order as node_modules.
function resolveDependencyKey(
  lockPackages: Record<string, unknown>,
  chain: string[],
  depName: string,
): string[] | undefined {
  for (let depth = chain.length; depth >= 0; depth--) {
    const candidate = [...chain.slice(0, depth), depName];
    if (candidate.join("/") in lockPackages) return candidate;
  }
  return undefined;
}

function collectPackage(
  collected: Map<string, CursorSdkVendorPackage>,
  key: string,
  entry: LockEntry,
): void {
  if (!entry.integrity?.startsWith("sha512-")) {
    throw new Error(
      `Lockfile entry "${key}" has no sha512 integrity — only registry packages can be vendored`,
    );
  }

  const existing = collected.get(entry.name);
  if (existing && existing.version !== entry.version) {
    // The vendor tree is a flat node_modules; two versions of one package
    // would collide. Nothing in the current closure does this.
    throw new Error(
      `Cursor SDK closure needs "${entry.name}" at both ${existing.version} and ${entry.version}; the flat vendor layout cannot represent that`,
    );
  }
  if (existing) return;

  collected.set(entry.name, {
    name: entry.name,
    version: entry.version,
    integrity: entry.integrity,
    ...(entry.os === undefined ? {} : { os: entry.os }),
    ...(entry.cpu === undefined ? {} : { cpu: entry.cpu }),
    ...(entry.bin === undefined ? {} : { bin: entry.bin }),
  });
}

function findSdkVersion(
  collected: Map<string, CursorSdkVendorPackage>,
): string {
  const sdk = collected.get(CURSOR_SDK_PACKAGE_NAME);
  if (!sdk) {
    throw new Error(`Closure walk did not collect ${CURSOR_SDK_PACKAGE_NAME}`);
  }
  return sdk.version;
}

// Guards against silently generating a manifest that is missing packages the
// SDK requires at runtime (verified against @cursor/sdk@1.0.23's dist).
function assertClosureSanity(packages: CursorSdkVendorPackage[]): void {
  const names = new Set(packages.map((pkg) => pkg.name));
  for (const required of ["undici", "@fastify/busboy", "zod"]) {
    if (!names.has(required)) {
      throw new Error(
        `Cursor SDK closure is missing "${required}" — the lockfile walk looks broken`,
      );
    }
  }
  if (!packages.some((pkg) => pkg.os && pkg.cpu && pkg.bin)) {
    throw new Error(
      "Cursor SDK closure has no platform ripgrep package — the lockfile walk looks broken",
    );
  }
}
