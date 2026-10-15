// Bare-specifier resolution for the vendored Cursor SDK (installCursorSdk.ts).
// Compiled single-file binaries load real on-disk files fine but have no
// node_modules resolution, so a Module._resolveFilename hook maps the bare
// requires the SDK's dist makes (e.g. "@connectrpc/connect/protocol") onto
// the vendor tree. The hook is parent-scoped: only requires originating from
// files inside the vendor root are served, so the vendored zod@3/undici@5
// never leak into the rest of the process.

import fs from "node:fs";
import Module from "node:module";
import path from "node:path";

export interface VendorResolveHookHandle {
  uninstall(): void;
}

const installedVendorRoots = new Map<string, VendorResolveHookHandle>();

export function installVendorResolveHook(
  vendorRoot: string,
  packageNames: ReadonlySet<string>,
): VendorResolveHookHandle {
  const existing = installedVendorRoots.get(vendorRoot);
  if (existing) return existing;

  const vendorNodeModules = path.join(vendorRoot, "node_modules");
  const vendorPrefix = vendorRoot + path.sep;
  const resolutionCache = new Map<string, string | undefined>();

  const moduleWithResolveFilename = Module as typeof Module & {
    _resolveFilename(this: void, ...args: unknown[]): string;
  };

  const resolveFilename = moduleWithResolveFilename._resolveFilename;

  moduleWithResolveFilename._resolveFilename = function (...args: unknown[]) {
    const [request, parent] = args as [
      unknown,
      { filename?: string | null } | undefined,
    ];

    if (
      typeof request === "string" &&
      isBareSpecifier(request) &&
      parent?.filename?.startsWith(vendorPrefix)
    ) {
      let resolved = resolutionCache.get(request);
      if (!resolutionCache.has(request)) {
        const { packageName, subpath } = splitBareSpecifier(request);
        resolved = packageNames.has(packageName)
          ? resolvePackageEntry(vendorNodeModules, packageName, subpath)
          : undefined;
        resolutionCache.set(request, resolved);
      }
      if (resolved) return resolved;
    }

    return resolveFilename.call(this, ...args);
  };

  const handle: VendorResolveHookHandle = {
    uninstall() {
      moduleWithResolveFilename._resolveFilename = resolveFilename;
      installedVendorRoots.delete(vendorRoot);
    },
  };
  installedVendorRoots.set(vendorRoot, handle);
  return handle;
}

function isBareSpecifier(request: string): boolean {
  return (
    !request.startsWith(".") &&
    !path.isAbsolute(request) &&
    !request.startsWith("node:") &&
    !request.startsWith("bun:")
  );
}

function splitBareSpecifier(request: string): {
  packageName: string;
  subpath: string;
} {
  const segments = request.split("/");
  const nameLength = request.startsWith("@") ? 2 : 1;
  return {
    packageName: segments.slice(0, nameLength).join("/"),
    subpath:
      segments.length > nameLength
        ? `./${segments.slice(nameLength).join("/")}`
        : ".",
  };
}

/**
 * Resolves a package subpath (`"."` or `"./sub/path"`) to an absolute file
 * inside the vendor node_modules, honoring the package's `exports` map or
 * falling back to `main`/index with extension probing.
 */
export function resolvePackageEntry(
  vendorNodeModules: string,
  packageName: string,
  subpath: string,
): string | undefined {
  const packageDir = path.join(vendorNodeModules, packageName);
  const manifest = readPackageManifest(packageDir);
  if (!manifest) return undefined;

  if (manifest.exports != null) {
    const target = lookupExports(manifest.exports, subpath);
    return target === undefined
      ? undefined
      : resolveExportTarget(packageDir, target);
  }

  const candidate =
    subpath === "."
      ? typeof manifest.main === "string"
        ? manifest.main
        : "index.js"
      : subpath;
  return probeFile(path.join(packageDir, candidate));
}

interface PackageManifest {
  main?: unknown;
  exports?: unknown;
}

const manifestCache = new Map<string, PackageManifest | undefined>();

function readPackageManifest(packageDir: string): PackageManifest | undefined {
  if (!manifestCache.has(packageDir)) {
    let manifest: PackageManifest | undefined;
    try {
      manifest = JSON.parse(
        fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"),
      ) as PackageManifest;
    } catch {
      manifest = undefined;
    }
    manifestCache.set(packageDir, manifest);
  }
  return manifestCache.get(packageDir);
}

function lookupExports(exports: unknown, subpath: string): unknown {
  // Sugar forms: a bare target or a conditions object (no "."-prefixed
  // keys) stand for { ".": <exports> }.
  const isSubpathMap =
    typeof exports === "object" &&
    exports !== null &&
    !Array.isArray(exports) &&
    Object.keys(exports).every((key) => key === "." || key.startsWith("./"));

  if (!isSubpathMap) return subpath === "." ? exports : undefined;

  const map = exports as Record<string, unknown>;
  if (subpath in map) return map[subpath];

  // Single-asterisk pattern fallback (none in the current SDK closure).
  for (const [key, value] of Object.entries(map)) {
    const asterisk = key.indexOf("*");
    if (asterisk < 0 || key.indexOf("*", asterisk + 1) >= 0) continue;
    const prefix = key.slice(0, asterisk);
    const suffix = key.slice(asterisk + 1);
    if (
      subpath.length > prefix.length + suffix.length &&
      subpath.startsWith(prefix) &&
      subpath.endsWith(suffix)
    ) {
      const wildcard = subpath.slice(
        prefix.length,
        subpath.length - suffix.length,
      );
      return typeof value === "string"
        ? value.replaceAll("*", wildcard)
        : value;
    }
  }
  return undefined;
}

// The vendored SDK is loaded over CJS require, so of the standard export
// conditions only these apply.
const ACCEPTED_CONDITIONS = new Set(["require", "node", "default"]);

function resolveExportTarget(
  packageDir: string,
  target: unknown,
): string | undefined {
  if (typeof target === "string") {
    if (!target.startsWith("./")) return undefined;
    const resolved = path.join(packageDir, target);
    return isFile(resolved) ? resolved : undefined;
  }

  if (Array.isArray(target)) {
    for (const entry of target) {
      const resolved = resolveExportTarget(packageDir, entry);
      if (resolved) return resolved;
    }
    return undefined;
  }

  if (typeof target === "object" && target !== null) {
    for (const [condition, value] of Object.entries(target)) {
      if (!ACCEPTED_CONDITIONS.has(condition)) continue;
      const resolved = resolveExportTarget(packageDir, value);
      if (resolved) return resolved;
    }
  }

  return undefined;
}

function probeFile(candidate: string): string | undefined {
  for (const probe of [
    candidate,
    `${candidate}.js`,
    `${candidate}.json`,
    path.join(candidate, "index.js"),
    path.join(candidate, "index.json"),
  ]) {
    if (isFile(probe)) return probe;
  }
  return undefined;
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
