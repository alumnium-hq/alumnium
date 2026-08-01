import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CursorSdkVendorManifest } from "./cursorSdkManifest.ts";
import { installVendorResolveHook } from "./cursorSdkResolver.ts";
import {
  ensureVendorTree,
  loadSdkFromVendorRoot,
  packagesForPlatform,
} from "./installCursorSdk.ts";

// Minimal tar builder mirroring the layout of npm registry tarballs.
function tarEntry(name: string, content: string, mode = 0o644): Uint8Array {
  const data = Buffer.from(content);
  const header = Buffer.alloc(512);

  header.write(name, 0, 100, "utf-8");
  header.write(mode.toString(8).padStart(7, "0"), 100);
  header.write("0000000", 108);
  header.write("0000000", 116);
  header.write(data.length.toString(8).padStart(11, "0"), 124);
  header.write("00000000000", 136);
  header.write(" ".repeat(8), 148);
  header.write("0", 156);
  header.write("ustar", 257);
  header.write("00", 263);

  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);

  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
  data.copy(padded);
  return Buffer.concat([header, padded]);
}

function packageTgz(files: Record<string, string | [string, number]>): Buffer {
  const entries = Object.entries(files).map(([name, value]) =>
    typeof value === "string"
      ? tarEntry(`package/${name}`, value)
      : tarEntry(`package/${name}`, value[0], value[1]),
  );
  return Buffer.from(gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])));
}

function integrityOf(tgz: Buffer): string {
  return `sha512-${createHash("sha512").update(tgz).digest("base64")}`;
}

const SDK_TGZ = packageTgz({
  "package.json": JSON.stringify({
    name: "@cursor/sdk",
    version: "9.9.9",
    type: "module",
    main: "./dist/cjs/index.js",
    exports: {
      ".": { require: "./dist/cjs/index.js", default: "./dist/esm/index.js" },
    },
  }),
  "dist/cjs/package.json": '{"type":"commonjs"}',
  "dist/cjs/index.js":
    'module.exports = { marker: "sdk", dep: require("dep-a") };',
});

const DEP_TGZ = packageTgz({
  "package.json": JSON.stringify({
    name: "dep-a",
    version: "1.0.0",
    main: "lib/main",
  }),
  "lib/main.js": 'module.exports = "dep-a-loaded";',
});

const RIPGREP_TGZ = packageTgz({
  "package.json": JSON.stringify({
    name: "@cursor/sdk-platform",
    version: "9.9.9",
  }),
  "bin/rg": ["#!/bin/sh\n", 0o755],
});

const TARBALLS: Record<string, Buffer> = {
  "https://registry.npmjs.org/@cursor/sdk/-/sdk-9.9.9.tgz": SDK_TGZ,
  "https://registry.npmjs.org/dep-a/-/dep-a-1.0.0.tgz": DEP_TGZ,
  "https://registry.npmjs.org/@cursor/sdk-platform/-/sdk-platform-9.9.9.tgz":
    RIPGREP_TGZ,
};

function fixtureManifest(): CursorSdkVendorManifest {
  return {
    sdkVersion: "9.9.9",
    packages: [
      {
        name: "@cursor/sdk",
        version: "9.9.9",
        integrity: integrityOf(SDK_TGZ),
      },
      { name: "dep-a", version: "1.0.0", integrity: integrityOf(DEP_TGZ) },
      {
        name: "@cursor/sdk-platform",
        version: "9.9.9",
        integrity: integrityOf(RIPGREP_TGZ),
        // Matches the machine the tests run on so the package is selected.
        os: process.platform,
        cpu: process.arch,
        bin: { rg: "bin/rg" },
      },
    ],
  };
}

let baseDir: string;
let vendorRoot: string;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "install-cursor-sdk-"));
  vendorRoot = path.join(baseDir, "9.9.9");
  vi.stubEnv("CURSOR_RIPGREP_PATH", undefined);
  vi.stubEnv("ALUMNIUM_NO_RETRY", "true");

  fetchMock = vi.fn((url: string) => {
    const tgz = TARBALLS[url];
    if (!tgz) return Promise.resolve(new Response(null, { status: 404 }));
    return Promise.resolve(new Response(new Uint8Array(tgz)));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  installVendorResolveHook(vendorRoot, new Set()).uninstall();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await fs.rm(baseDir, { recursive: true, force: true });
});

describe("ensureVendorTree", () => {
  it("downloads, verifies, and atomically installs the closure", async () => {
    await ensureVendorTree(fixtureManifest(), vendorRoot);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const marker = JSON.parse(
      await fs.readFile(path.join(vendorRoot, ".alumnium-complete"), "utf-8"),
    );
    expect(marker.sdkVersion).toBe("9.9.9");
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(vendorRoot, "node_modules/@cursor/sdk/package.json"),
          "utf-8",
        ),
      ).version,
    ).toBe("9.9.9");
    if (process.platform !== "win32") {
      const rg = await fs.stat(
        path.join(vendorRoot, "node_modules/@cursor/sdk-platform/bin/rg"),
      );
      expect(rg.mode & 0o111).toBeTruthy();
    }
    expect(await fs.readdir(baseDir)).toEqual(["9.9.9"]);
  });

  it("short-circuits when the completion marker exists", async () => {
    await ensureVendorTree(fixtureManifest(), vendorRoot);
    fetchMock.mockClear();

    await ensureVendorTree(fixtureManifest(), vendorRoot);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-installs over a markerless leftover tree", async () => {
    await ensureVendorTree(fixtureManifest(), vendorRoot);
    await fs.rm(path.join(vendorRoot, ".alumnium-complete"));
    fetchMock.mockClear();

    await ensureVendorTree(fixtureManifest(), vendorRoot);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      await fs.readFile(path.join(vendorRoot, ".alumnium-complete"), "utf-8"),
    ).toContain("9.9.9");
  });

  it("rejects tampered downloads and leaves nothing behind", async () => {
    const manifest = fixtureManifest();
    (manifest.packages[1] as { integrity: string }).integrity =
      "sha512-invalid";

    await expect(ensureVendorTree(manifest, vendorRoot)).rejects.toThrow(
      /Integrity check failed for dep-a@1\.0\.0/,
    );
    expect(await fs.readdir(baseDir)).toEqual([]);
  });

  it("wraps network failures with actionable guidance", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      ensureVendorTree(fixtureManifest(), vendorRoot),
    ).rejects.toThrow(/ALUMNIUM_CURSOR_SDK_DIR/);
  });
});

describe("packagesForPlatform", () => {
  it("keeps universal packages and the matching ripgrep package", () => {
    const names = packagesForPlatform(
      fixtureManifest(),
      process.platform,
      process.arch,
    ).map((pkg) => pkg.name);

    expect(names).toEqual(["@cursor/sdk", "dep-a", "@cursor/sdk-platform"]);
  });

  it("falls back to x64 ripgrep on Windows ARM", () => {
    const manifest = fixtureManifest();
    (manifest.packages[2] as { os: string; cpu: string }).os = "win32";
    (manifest.packages[2] as { os: string; cpu: string }).cpu = "x64";

    const names = packagesForPlatform(manifest, "win32", "arm64").map(
      (pkg) => pkg.name,
    );

    expect(names).toContain("@cursor/sdk-platform");
  });

  it("omits ripgrep when no package matches the platform", () => {
    const names = packagesForPlatform(fixtureManifest(), "freebsd", "x64").map(
      (pkg) => pkg.name,
    );

    expect(names).toEqual(["@cursor/sdk", "dep-a"]);
  });
});

describe("loadSdkFromVendorRoot", () => {
  it("loads the vendored SDK with bare requires served from the vendor tree", async () => {
    const manifest = fixtureManifest();
    await ensureVendorTree(manifest, vendorRoot);

    const sdk = (await loadSdkFromVendorRoot(manifest, vendorRoot)) as {
      marker?: string;
      dep?: string;
    };

    expect(sdk.marker).toBe("sdk");
    expect(sdk.dep).toBe("dep-a-loaded");
    // oxlint-disable-next-line no-process-env -- asserts the ripgrep pointer handed to the SDK
    expect(process.env.CURSOR_RIPGREP_PATH).toBe(
      path.join(vendorRoot, "node_modules/@cursor/sdk-platform/bin/rg"),
    );
  });

  it("fails clearly when the vendor tree is unusable", async () => {
    await fs.mkdir(vendorRoot, { recursive: true });

    await expect(
      loadSdkFromVendorRoot(fixtureManifest(), vendorRoot),
    ).rejects.toThrow(/missing or unreadable/);
  });
});
