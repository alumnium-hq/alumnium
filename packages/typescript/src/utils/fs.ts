import filenamify from "filenamify";
import path from "node:path";

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
