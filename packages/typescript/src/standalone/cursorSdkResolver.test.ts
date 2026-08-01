import fs from "node:fs/promises";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installVendorResolveHook,
  resolvePackageEntry,
  type VendorResolveHookHandle,
} from "./cursorSdkResolver.ts";

const moduleWithResolveFilename = Module as typeof Module & {
  _resolveFilename(this: void, ...args: unknown[]): string;
};

let vendorRoot: string;
let nodeModules: string;
let handle: VendorResolveHookHandle | undefined;

async function writePackage(
  name: string,
  manifest: Record<string, unknown>,
  files: string[],
): Promise<void> {
  const packageDir = path.join(nodeModules, name);
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(
    path.join(packageDir, "package.json"),
    JSON.stringify({ name, version: "1.0.0", ...manifest }),
  );
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(packageDir, file)), {
      recursive: true,
    });
    await fs.writeFile(path.join(packageDir, file), "module.exports = {};");
  }
}

beforeEach(async () => {
  vendorRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vendor-test-"));
  nodeModules = path.join(vendorRoot, "node_modules");

  await writePackage(
    "@connectrpc/connect",
    {
      exports: {
        ".": { import: "./dist/esm/index.js", require: "./dist/cjs/index.js" },
        "./protocol": {
          import: "./dist/esm/protocol/index.js",
          require: "./dist/cjs/protocol/index.js",
        },
      },
    },
    ["dist/cjs/index.js", "dist/cjs/protocol/index.js"],
  );
  await writePackage("busboyish", { main: "lib/main" }, ["lib/main.js"]);
  await writePackage("statsigish", { main: "./src/index.js" }, [
    "src/index.js",
  ]);
  await writePackage("sugary", { exports: "./index.cjs" }, ["index.cjs"]);
  await writePackage(
    "conditional",
    { exports: { require: "./r.js", default: "./d.js" } },
    ["r.js", "d.js"],
  );
  await writePackage("bare", {}, ["index.js"]);
});

afterEach(async () => {
  handle?.uninstall();
  handle = undefined;
  await fs.rm(vendorRoot, { recursive: true, force: true });
});

describe("resolvePackageEntry", () => {
  it("resolves the require condition from an exports map", () => {
    expect(resolvePackageEntry(nodeModules, "@connectrpc/connect", ".")).toBe(
      path.join(nodeModules, "@connectrpc/connect/dist/cjs/index.js"),
    );
  });

  it("resolves exact subpath exports of scoped packages", () => {
    expect(
      resolvePackageEntry(nodeModules, "@connectrpc/connect", "./protocol"),
    ).toBe(
      path.join(nodeModules, "@connectrpc/connect/dist/cjs/protocol/index.js"),
    );
  });

  it("resolves an extensionless main with probing", () => {
    expect(resolvePackageEntry(nodeModules, "busboyish", ".")).toBe(
      path.join(nodeModules, "busboyish/lib/main.js"),
    );
  });

  it("resolves a plain main without exports", () => {
    expect(resolvePackageEntry(nodeModules, "statsigish", ".")).toBe(
      path.join(nodeModules, "statsigish/src/index.js"),
    );
  });

  it("resolves string-sugar exports", () => {
    expect(resolvePackageEntry(nodeModules, "sugary", ".")).toBe(
      path.join(nodeModules, "sugary/index.cjs"),
    );
  });

  it("resolves condition-object sugar exports, preferring require", () => {
    expect(resolvePackageEntry(nodeModules, "conditional", ".")).toBe(
      path.join(nodeModules, "conditional/r.js"),
    );
  });

  it("falls back to index.js without main", () => {
    expect(resolvePackageEntry(nodeModules, "bare", ".")).toBe(
      path.join(nodeModules, "bare/index.js"),
    );
  });

  it("returns undefined for unexported subpaths and missing packages", () => {
    expect(
      resolvePackageEntry(nodeModules, "@connectrpc/connect", "./missing"),
    ).toBeUndefined();
    expect(resolvePackageEntry(nodeModules, "ghost", ".")).toBeUndefined();
  });
});

describe("installVendorResolveHook", () => {
  const packageNames = new Set([
    "@connectrpc/connect",
    "busboyish",
    "statsigish",
  ]);

  function resolveAs(parentFile: string | undefined, request: string): string {
    return moduleWithResolveFilename._resolveFilename(
      request,
      parentFile === undefined
        ? undefined
        : { filename: parentFile, id: parentFile, paths: [] },
      false,
    );
  }

  function vendorParent(): string {
    return path.join(nodeModules, "@cursor/sdk/dist/cjs/index.js");
  }

  it("serves manifest packages for requires originating inside the vendor root", () => {
    handle = installVendorResolveHook(vendorRoot, packageNames);

    expect(resolveAs(vendorParent(), "busboyish")).toBe(
      path.join(nodeModules, "busboyish/lib/main.js"),
    );
    expect(resolveAs(vendorParent(), "@connectrpc/connect/protocol")).toBe(
      path.join(nodeModules, "@connectrpc/connect/dist/cjs/protocol/index.js"),
    );
  });

  it("ignores requests from outside the vendor root", () => {
    handle = installVendorResolveHook(vendorRoot, packageNames);

    expect(() =>
      resolveAs(path.join(os.tmpdir(), "elsewhere/app.js"), "busboyish"),
    ).toThrow();
  });

  it("passes through builtins and unknown packages", () => {
    handle = installVendorResolveHook(vendorRoot, packageNames);

    expect(resolveAs(vendorParent(), "node:fs")).toBe("node:fs");
    expect(() => resolveAs(vendorParent(), "not-vendored-pkg")).toThrow();
  });

  it("is idempotent per vendor root and restores on uninstall", () => {
    handle = installVendorResolveHook(vendorRoot, packageNames);
    expect(installVendorResolveHook(vendorRoot, packageNames)).toBe(handle);

    handle.uninstall();
    handle = undefined;
    expect(() => resolveAs(vendorParent(), "busboyish")).toThrow();
  });
});
