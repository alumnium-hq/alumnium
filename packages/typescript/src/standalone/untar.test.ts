import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { untarInto } from "./untar.ts";

interface EntryOptions {
  type?: string;
  mode?: number;
  prefix?: string;
  corruptChecksum?: boolean;
}

function tarEntry(
  name: string,
  content = "",
  options: EntryOptions = {},
): Uint8Array {
  const data = Buffer.from(content);
  const header = Buffer.alloc(512);

  header.write(name, 0, 100, "utf-8");
  header.write((options.mode ?? 0o644).toString(8).padStart(7, "0"), 100);
  header.write("0000000", 108); // uid
  header.write("0000000", 116); // gid
  header.write(data.length.toString(8).padStart(11, "0"), 124);
  header.write("00000000000", 136); // mtime
  header.write(" ".repeat(8), 148); // checksum placeholder
  header.write(options.type ?? "0", 156);
  header.write("ustar", 257);
  header.write("00", 263);
  if (options.prefix) header.write(options.prefix, 345, 155, "utf-8");

  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);

  if (options.corruptChecksum) header.writeUInt8(header.readUInt8(0) ^ 0xff, 0);

  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
  data.copy(padded);
  return Buffer.concat([header, padded]);
}

function tarArchive(...entries: Uint8Array[]): Uint8Array {
  return Buffer.concat([...entries, Buffer.alloc(1024)]);
}

let destDir: string;

beforeEach(async () => {
  destDir = await fs.mkdtemp(path.join(os.tmpdir(), "untar-test-"));
});

afterEach(async () => {
  await fs.rm(destDir, { recursive: true, force: true });
});

describe("untarInto", () => {
  it("extracts nested files, stripping the root directory", async () => {
    await untarInto(
      tarArchive(
        tarEntry("package/", "", { type: "5" }),
        tarEntry("package/package.json", '{"name":"x"}'),
        tarEntry("package/dist/cjs/", "", { type: "5" }),
        tarEntry("package/dist/cjs/index.js", "module.exports = 1;"),
      ),
      destDir,
    );

    expect(await fs.readFile(path.join(destDir, "package.json"), "utf-8")).toBe(
      '{"name":"x"}',
    );
    expect(
      await fs.readFile(path.join(destDir, "dist/cjs/index.js"), "utf-8"),
    ).toBe("module.exports = 1;");
  });

  it("strips the first path segment whatever it is named", async () => {
    await untarInto(
      tarArchive(tarEntry("not-package/bin/rg", "binary")),
      destDir,
    );

    expect(await fs.readFile(path.join(destDir, "bin/rg"), "utf-8")).toBe(
      "binary",
    );
  });

  it("marks executables 0755 and other files 0644", async () => {
    await untarInto(
      tarArchive(
        tarEntry("package/bin/rg", "#!", { mode: 0o755 }),
        tarEntry("package/index.js", "1;", { mode: 0o664 }),
      ),
      destDir,
    );

    if (process.platform !== "win32") {
      const rg = await fs.stat(path.join(destDir, "bin/rg"));
      const index = await fs.stat(path.join(destDir, "index.js"));
      expect(rg.mode & 0o777).toBe(0o755);
      expect(index.mode & 0o777).toBe(0o644);
    }
  });

  it("joins the ustar prefix field onto the name", async () => {
    await untarInto(
      tarArchive(tarEntry("deep/file.js", "x", { prefix: "package/some" })),
      destDir,
    );

    expect(
      await fs.readFile(path.join(destDir, "some/deep/file.js"), "utf-8"),
    ).toBe("x");
  });

  it("honors pax extended-header path overrides", async () => {
    const longPath = `package/${"very-long-directory-name/".repeat(6)}file.js`;
    const record = ` path=${longPath}\n`;
    const paxData = `${record.length + String(record.length).length} ${record.slice(1)}`;

    await untarInto(
      tarArchive(
        tarEntry("PaxHeader/file.js", paxData, { type: "x" }),
        tarEntry("package/file.js", "long"),
      ),
      destDir,
    );

    expect(
      await fs.readFile(
        path.join(destDir, ...longPath.split("/").slice(1)),
        "utf-8",
      ),
    ).toBe("long");
  });

  it("honors GNU longname entries", async () => {
    const longPath = `package/${"nested/".repeat(20)}leaf.js`;

    await untarInto(
      tarArchive(
        tarEntry("././@LongLink", `${longPath}\0`, { type: "L" }),
        tarEntry("package/leaf.js", "leaf"),
      ),
      destDir,
    );

    expect(
      await fs.readFile(
        path.join(destDir, ...longPath.split("/").slice(1)),
        "utf-8",
      ),
    ).toBe("leaf");
  });

  it("rejects corrupted headers", async () => {
    await expect(
      untarInto(
        tarArchive(tarEntry("package/x", "x", { corruptChecksum: true })),
        destDir,
      ),
    ).rejects.toThrow(/checksum mismatch/);
  });

  it("rejects path traversal and absolute paths", async () => {
    await expect(
      untarInto(tarArchive(tarEntry("package/../../evil", "x")), destDir),
    ).rejects.toThrow(/unsafe path/);

    await expect(
      untarInto(tarArchive(tarEntry("/etc/passwd", "x")), destDir),
    ).rejects.toThrow(/absolute path/);
  });

  it("rejects link entries", async () => {
    await expect(
      untarInto(
        tarArchive(tarEntry("package/link", "", { type: "2" })),
        destDir,
      ),
    ).rejects.toThrow(/link/);
  });

  it("rejects truncated archives", async () => {
    const entry = tarEntry("package/big.js", "content beyond the header");
    await expect(untarInto(entry.subarray(0, 512), destDir)).rejects.toThrow(
      /Truncated/,
    );
  });

  it("extracts nothing for root-only archives", async () => {
    await untarInto(
      tarArchive(tarEntry("package/", "", { type: "5" })),
      destDir,
    );

    expect(await fs.readdir(destDir)).toEqual([]);
  });
});
