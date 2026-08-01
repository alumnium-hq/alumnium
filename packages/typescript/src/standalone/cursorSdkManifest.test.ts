import { describe, expect, it } from "vitest";
import { computeCursorSdkManifest } from "./cursorSdkManifest.ts";

// Mirrors bun.lock's entry shape: ["name@version", registry, meta?, integrity?].
function fixtureLock(
  overrides: Record<string, unknown> = {},
  removals: string[] = [],
) {
  const packages: Record<string, unknown> = {
    "@cursor/sdk": [
      "@cursor/sdk@1.0.23",
      "",
      {
        dependencies: {
          "@bufbuild/protobuf": "1.10.0",
          "@connectrpc/connect-node": "^1.6.1",
          zod: "^3.25.0",
        },
        optionalDependencies: { "@cursor/sdk-linux-x64": "1.0.23" },
      },
      "sha512-sdk",
    ],
    "@cursor/sdk-linux-x64": [
      "@cursor/sdk-linux-x64@1.0.23",
      "",
      { os: "linux", cpu: "x64", bin: { rg: "bin/rg" } },
      "sha512-rg",
    ],
    "@bufbuild/protobuf": ["@bufbuild/protobuf@1.10.0", "", {}, "sha512-buf"],
    "@connectrpc/connect": [
      "@connectrpc/connect@1.7.0",
      "",
      { peerDependencies: { "@bufbuild/protobuf": "^1.10.0" } },
      "sha512-connect",
    ],
    "@connectrpc/connect-node": [
      "@connectrpc/connect-node@1.7.0",
      "",
      {
        dependencies: { undici: "^5.28.4" },
        peerDependencies: {
          "@bufbuild/protobuf": "^1.10.0",
          "@connectrpc/connect": "1.7.0",
        },
      },
      "sha512-connect-node",
    ],
    "@connectrpc/connect-node/undici": [
      "undici@5.29.0",
      "",
      { dependencies: { "@fastify/busboy": "^2.0.0" } },
      "sha512-undici",
    ],
    "@fastify/busboy": ["@fastify/busboy@2.1.1", "", {}, "sha512-busboy"],
    "@cursor/sdk/zod": ["zod@3.25.76", "", {}, "sha512-zod3"],
    // Hoisted zod is v4 (used by the rest of the repo); the walk must pick
    // the alias-scoped v3 above instead.
    zod: ["zod@4.3.5", "", {}, "sha512-zod4"],
    ...overrides,
  };
  for (const key of removals) delete packages[key];
  return { lockfileVersion: 1, packages };
}

describe("computeCursorSdkManifest", () => {
  it("collects the transitive closure with parent-scoped alias keys", () => {
    const manifest = computeCursorSdkManifest(fixtureLock());

    expect(manifest.sdkVersion).toBe("1.0.23");
    expect(
      manifest.packages.map((pkg) => `${pkg.name}@${pkg.version}`),
    ).toEqual([
      "@bufbuild/protobuf@1.10.0",
      "@connectrpc/connect@1.7.0",
      "@connectrpc/connect-node@1.7.0",
      "@cursor/sdk@1.0.23",
      "@cursor/sdk-linux-x64@1.0.23",
      "@fastify/busboy@2.1.1",
      "undici@5.29.0",
      "zod@3.25.76",
    ]);
  });

  it("resolves nested alias keys against ancestors, not the hoisted entry", () => {
    const manifest = computeCursorSdkManifest(fixtureLock());

    const zod = manifest.packages.find((pkg) => pkg.name === "zod");
    expect(zod?.version).toBe("3.25.76");
    expect(zod?.integrity).toBe("sha512-zod3");

    // undici lives at "@connectrpc/connect-node/undici" and its own busboy
    // dep is only present hoisted — both hops must resolve.
    const undici = manifest.packages.find((pkg) => pkg.name === "undici");
    expect(undici?.version).toBe("5.29.0");
  });

  it("extracts os/cpu/bin for platform packages", () => {
    const manifest = computeCursorSdkManifest(fixtureLock());

    const platform = manifest.packages.find(
      (pkg) => pkg.name === "@cursor/sdk-linux-x64",
    );
    expect(platform).toEqual({
      name: "@cursor/sdk-linux-x64",
      version: "1.0.23",
      integrity: "sha512-rg",
      os: "linux",
      cpu: "x64",
      bin: { rg: "bin/rg" },
    });
  });

  it("throws when a required dependency is missing from the lockfile", () => {
    expect(() =>
      computeCursorSdkManifest(fixtureLock({}, ["@fastify/busboy"])),
    ).toThrow(/"@fastify\/busboy" of "@connectrpc\/connect-node\/undici"/);
  });

  it("throws when a package has no sha512 integrity", () => {
    expect(() =>
      computeCursorSdkManifest(
        fixtureLock({
          "@fastify/busboy": [
            "@fastify/busboy@file:../busboy",
            { dependencies: {} },
          ],
        }),
      ),
    ).toThrow(/no sha512 integrity/);
  });

  it("throws when the closure needs two versions of one package", () => {
    expect(() =>
      computeCursorSdkManifest(
        fixtureLock({
          "@connectrpc/connect-node/@bufbuild/protobuf": [
            "@bufbuild/protobuf@2.0.0",
            "",
            {},
            "sha512-buf2",
          ],
        }),
      ),
    ).toThrow(/flat vendor layout/);
  });

  it("throws when @cursor/sdk is not in the lockfile", () => {
    expect(() =>
      computeCursorSdkManifest({ lockfileVersion: 1, packages: {} }),
    ).toThrow(/no "@cursor\/sdk" entry/);
  });
});
