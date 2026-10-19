import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import filenamify from "filenamify";

/**
 * Creates a directory (recursively) only if it does not already exist.
 *
 * Avoids calling `fs.mkdir` for a directory that is already present. This
 * matters because Bun on Windows throws `EEXIST` for `fs.mkdir(".", ...)`
 * even though recursive mkdir is meant to be idempotent — so a bare-filename
 * path (dirname === ".") would otherwise crash the process.
 *
 * @param dir Directory path to ensure exists
 */
export async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
}

/**
 * Writes data to a file atomically by writing to a temporary file in the same
 * directory and renaming it over the target. Concurrent readers see either
 * the previous or the new content, never a partially written file, and
 * concurrent writers of the same path don't interleave.
 *
 * @param filePath File path to write
 * @param data Data to write to the file
 */
export async function writeFileAtomic(
  filePath: string,
  data: Buffer | string,
): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmpPath, data);
    await renameWithRetry(tmpPath, filePath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true });
    throw error;
  }
}

/**
 * Renames a file, retrying on Windows, where replacing a file that another
 * process has open fails with transient `EPERM`, `EACCES` or `EBUSY` errors.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fs.rename(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      const retriable =
        process.platform === "win32" &&
        WIN_RENAME_RETRY_CODES.includes(code) &&
        attempt < WIN_RENAME_MAX_ATTEMPTS;
      if (!retriable) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }
}

const WIN_RENAME_RETRY_CODES = ["EPERM", "EACCES", "EBUSY"];
const WIN_RENAME_MAX_ATTEMPTS = 10;

/**
 * Normalizes, sanitizes, and joins the specified path segments to form a safe
 * cross-platform file system path.
 *
 * @param segments Loose path segments to join
 * @returns Normalized, sanitized, and joined path
 */
export function safePathJoin(...segments: string[]): string {
  // Treat empty segments as ".".
  const normalizedNaiveSegments = segments.map((seg) =>
    seg === "" ? "." : seg,
  );
  const naivePath = normalizedNaiveSegments.join(path.sep);
  const naivePathParsed = path.parse(naivePath);

  const result = [];

  if (naivePathParsed.root) result.push(naivePathParsed.root);

  // Remove root from the path to preserve it in the final result.
  const naivePathRel = naivePath.slice(naivePathParsed.root.length);

  // Split path into segments to normalize OS-specific separators.
  const pathSegments = naivePathRel.split(ANY_SEP_RE);

  // Sanitize each segment.
  const sanitizedSegments = pathSegments.map((seg) => {
    // Preserve "." and ".." segments.
    if (seg === "." || seg === "..") return seg;
    return filenamify(seg, { replacement: "_" });
  });

  // Join the sanitized segments using the OS-specific separator.
  const joinedPath = path.join(...sanitizedSegments);

  // Preserve root path ("/" or "C:\")
  return naivePathParsed.root + joinedPath;
}

const ANY_SEP_RE = /[/\\]+/g;
