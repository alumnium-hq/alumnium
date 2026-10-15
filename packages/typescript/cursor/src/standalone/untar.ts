// Minimal tar extractor for npm registry tarballs (installCursorSdk.ts).
// Registry tarballs are constrained — ustar/pax with regular files and
// directories only — so a small reader with an explicit security posture
// (reject absolute paths, "..", and link entries) is preferred over adding
// a tar dependency that npm-package users would install but never run.

import fs from "node:fs/promises";
import path from "node:path";

const BLOCK_SIZE = 512;

const OFFSETS = {
  name: [0, 100],
  mode: [100, 8],
  size: [124, 12],
  checksum: [148, 8],
  typeflag: 156,
  prefix: [345, 155],
} as const;

/**
 * Extracts a (gunzipped) npm package tarball into destDir, stripping the
 * tarball's single root directory (usually "package/") the way npm does.
 */
export async function untarInto(
  tarBytes: Uint8Array,
  destDir: string,
): Promise<void> {
  let offset = 0;
  // A pax "x" or GNU "L" entry overrides the following entry's path.
  let pendingPath: string | undefined;

  while (offset + BLOCK_SIZE <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + BLOCK_SIZE);
    if (isZeroBlock(header)) break;
    verifyChecksum(header);

    const size = readNumeric(header, ...OFFSETS.size);
    const dataStart = offset + BLOCK_SIZE;
    if (dataStart + size > tarBytes.length) {
      throw new Error("Truncated tar archive");
    }
    const data = tarBytes.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;

    const typeflag = String.fromCharCode(header[OFFSETS.typeflag] ?? 0);

    if (typeflag === "x") {
      pendingPath = parsePaxPath(data) ?? pendingPath;
      continue;
    }
    if (typeflag === "L") {
      pendingPath = decodeToNul(data);
      continue;
    }
    if (typeflag === "1" || typeflag === "2") {
      throw new Error(
        `Tar entry "${decodeToNul(header.subarray(...spanOf(OFFSETS.name)))}" is a link; links are not allowed in npm tarballs`,
      );
    }
    if (typeflag !== "0" && typeflag !== "\0" && typeflag !== "5") {
      // Other entry types (pax globals, GNU extensions) carry no payload we
      // need; their data has already been skipped over.
      pendingPath = undefined;
      continue;
    }

    const entryPath = pendingPath ?? ustarPath(header);
    pendingPath = undefined;

    // Drop the tarball's root directory. npm strips the first path segment
    // whatever it is named, so entries at the root itself vanish.
    const segments = sanitizedSegments(entryPath).slice(1);
    if (!segments.length) continue;
    const target = path.join(destDir, ...segments);

    if (typeflag === "5") {
      await fs.mkdir(target, { recursive: true });
      continue;
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    const mode = readNumeric(header, ...OFFSETS.mode);
    await fs.writeFile(target, data, {
      mode: mode & 0o111 ? 0o755 : 0o644,
    });
  }
}

function spanOf(field: readonly [number, number]): [number, number] {
  return [field[0], field[0] + field[1]];
}

function isZeroBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

function verifyChecksum(header: Uint8Array): void {
  const stored = readNumeric(header, ...OFFSETS.checksum);
  const [checksumStart, checksumEnd] = spanOf(OFFSETS.checksum);

  let computed = 0;
  for (let index = 0; index < BLOCK_SIZE; index++) {
    computed +=
      index >= checksumStart && index < checksumEnd
        ? 0x20
        : (header[index] as number);
  }

  if (computed !== stored) {
    throw new Error("Tar header checksum mismatch — the archive is corrupted");
  }
}

// Tar numeric fields are NUL/space-terminated ASCII octal, or base-256
// (leading byte with the high bit set) for values that do not fit.
function readNumeric(
  header: Uint8Array,
  start: number,
  length: number,
): number {
  const first = header[start] as number;

  if (first & 0x80) {
    let value = first & 0x7f;
    for (let index = start + 1; index < start + length; index++) {
      value = value * 256 + (header[index] as number);
    }
    return value;
  }

  const text = decodeToNul(header.subarray(start, start + length)).trim();
  return text ? Number.parseInt(text, 8) : 0;
}

function decodeToNul(bytes: Uint8Array): string {
  const nul = bytes.indexOf(0);
  return new TextDecoder().decode(nul < 0 ? bytes : bytes.subarray(0, nul));
}

function ustarPath(header: Uint8Array): string {
  const name = decodeToNul(header.subarray(...spanOf(OFFSETS.name)));
  const prefix = decodeToNul(header.subarray(...spanOf(OFFSETS.prefix)));
  return prefix ? `${prefix}/${name}` : name;
}

// Pax extended header data is a sequence of "<byteLength> <key>=<value>\n"
// records. Decoded as latin1 so string indices equal byte offsets; values
// are re-decoded as UTF-8.
function parsePaxPath(data: Uint8Array): string | undefined {
  const text = Buffer.from(data).toString("latin1");
  let cursor = 0;
  let result: string | undefined;

  while (cursor < text.length) {
    const lengthEnd = text.indexOf(" ", cursor);
    if (lengthEnd < 0) break;
    const recordLength = Number(text.slice(cursor, lengthEnd));
    if (!Number.isInteger(recordLength) || recordLength <= 0) break;
    const recordEnd = cursor + recordLength;

    const equals = text.indexOf("=", lengthEnd + 1);
    if (equals > 0 && equals < recordEnd) {
      const key = text.slice(lengthEnd + 1, equals);
      if (key === "path") {
        const value = text.slice(equals + 1, recordEnd - 1);
        result = Buffer.from(value, "latin1").toString("utf8");
      }
    }

    cursor = recordEnd;
  }

  return result;
}

function sanitizedSegments(entryPath: string): string[] {
  if (entryPath.startsWith("/") || /^[A-Za-z]:/.test(entryPath)) {
    throw new Error(`Tar entry "${entryPath}" has an absolute path`);
  }

  const segments = entryPath
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");

  for (const segment of segments) {
    if (segment === ".." || segment.includes("\\") || segment.includes(":")) {
      throw new Error(`Tar entry "${entryPath}" has an unsafe path`);
    }
  }

  return segments;
}
