import path from "node:path";

/**
 * Built-in SSRF-protection denylist patterns enforced on every session, with no opt-in and no
 * opt-out — scoped to addresses that are never a legitimate manual test-navigation target (cloud
 * metadata endpoints, IPv6 link-local, `file://`). Always merged into a {@link NavigationPolicy}'s
 * denylist and cannot be disabled by caller-supplied `denylistDomains`.
 */
export const ALWAYS_ON_DENYLIST_PATTERNS: string[] = [
  "169\\.254\\.", // link-local IPs, incl. cloud metadata endpoints (AWS/GCP/Azure)
  "^\\[?fe80:", // IPv6 link-local
  "^file://",
];

/**
 * Additional denylist patterns for loopback/unspecified addresses. Deliberately *not* part of
 * {@link ALWAYS_ON_DENYLIST_PATTERNS} — `localhost`/`127.0.0.1`/etc. are the overwhelmingly
 * common target for testing a locally-running app, so blocking them unconditionally would break
 * ordinary usage. Only merged in once a session opts into `allowlistDomains` (see
 * {@link NavigationPolicy.create}), where the caller has already scoped navigation to an
 * approved domain list and can add loopback back in explicitly if they need it.
 */
export const LOCKDOWN_LOOPBACK_DENYLIST_PATTERNS: string[] = [
  "^127\\.", // IPv4 loopback range
  "(^|\\.)localhost$",
  "^0\\.0\\.0\\.0$",
  "^\\[?::1\\]?$", // IPv6 loopback
];

type PolicyField = "allowlistDomains" | "denylistDomains" | "allowedFilePaths";

/**
 * Thrown by {@link NavigationPolicy.create} when a caller-supplied pattern or path fails
 * validation (an invalid regex, or a non-absolute `allowedFilePaths` entry).
 */
export class NavigationPolicyConfigError extends Error {
  constructor(field: PolicyField, value: string, cause: unknown) {
    super(`Invalid ${field} entry "${value}": ${cause}`);
    this.name = "NavigationPolicyConfigError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NavigationPolicyConfigError);
    }
  }
}

/**
 * Thrown by {@link NavigationPolicy.check} when a navigation target is not allowed by the
 * active domain policy.
 */
export class NavigationBlockedError extends Error {
  constructor(url: string, reason: string) {
    super(`Navigation to "${url}" blocked by domain policy (${reason})`);
    this.name = "NavigationBlockedError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NavigationBlockedError);
    }
  }
}

function extractHostname(url: string): string {
  return URL.parse(url)?.hostname?.toLowerCase() ?? "";
}

const IPV4_MAPPED_HEX = /(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;
const IPV4_MAPPED_DOTTED = /(?:^|:)ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

/**
 * Decodes an IPv4-mapped IPv6 literal (e.g. `::ffff:7f00:1`, the WHATWG URL parser's canonical
 * hex-encoded form of `::ffff:127.0.0.1`) back to its embedded dotted-decimal IPv4 address, so
 * decimal-based patterns (e.g. `^127\.`) still catch it. Returns `null` if `hostname` isn't an
 * IPv4-mapped IPv6 literal.
 */
function unwrapIPv4MappedIPv6(hostname: string): string | null {
  const stripped = hostname.replace(/^\[/, "").replace(/\]$/, "");

  const dotted = stripped.match(IPV4_MAPPED_DOTTED);
  if (dotted) return dotted[1]!;

  const hex = stripped.match(IPV4_MAPPED_HEX);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }

  return null;
}

interface CompiledPattern {
  /** Original pattern text, for human-readable error messages (RegExp#source auto-escapes "/"). */
  pattern: string;
  regex: RegExp;
}

function compilePatterns(
  patterns: string[],
  field: PolicyField,
): CompiledPattern[] {
  return patterns.map((pattern) => {
    try {
      return { pattern, regex: new RegExp(pattern, "i") };
    } catch (error) {
      throw new NavigationPolicyConfigError(field, pattern, error);
    }
  });
}

function matchesAny(
  patterns: CompiledPattern[],
  haystacks: string[],
): CompiledPattern | undefined {
  return patterns.find((pattern) =>
    haystacks.some((haystack) => pattern.regex.test(haystack)),
  );
}

/**
 * Whether `url` is a `file://` URL whose (decoded, `..`/`.`-collapsed) path is exactly one of
 * `allowedFilePaths` or nested under one. Used as a hard override in {@link
 * NavigationPolicy.evaluate}, ahead of the denylist/allowlist logic — see that method's doc for
 * why this is safe to expose only via direct SDK options, never MCP's `start` tool.
 */
function isAllowedFilePath(url: string, allowedFilePaths: string[]): boolean {
  if (allowedFilePaths.length === 0) return false;

  const parsed = URL.parse(url);
  if (!parsed || parsed.protocol !== "file:") return false;

  const normalized = path.posix.normalize(decodeURIComponent(parsed.pathname));
  return allowedFilePaths.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export namespace NavigationPolicy {
  export interface Options {
    allowlistDomains?: string[] | undefined;
    denylistDomains?: string[] | undefined;
    /**
     * Absolute local filesystem path prefixes that `file://` navigation may reference,
     * overriding the always-on `file://` denylist for exactly those paths. Deliberately not a
     * field of `startMcpTool`'s `alumnium:options` schema — only code that directly constructs
     * an `Alumni`/`Area` instance can set this, never a remote MCP `start` caller, a `do()` goal
     * string, or a webpage's content. Intended for embedders (like this repo's own system tests)
     * that need to load local HTML fixtures.
     */
    allowedFilePaths?: string[] | undefined;
  }

  export interface Evaluation {
    allowed: boolean;
    reason?: string;
  }
}

/**
 * Enforces a per-session domain allowlist/denylist against navigation targets. Every session gets
 * one — see {@link NavigationPolicy.create} — there is no way to construct a driver with no
 * policy at all, and no opt-out for the always-on denylist.
 *
 * Two modes, both handled by {@link NavigationPolicy.evaluate}:
 * - **Open** (`allowlistDomains` not set): only {@link ALWAYS_ON_DENYLIST_PATTERNS} plus any
 *   caller `denylistDomains` are blocked; everything else — including `localhost`/`127.0.0.1` —
 *   is allowed.
 * - **Lockdown** (`allowlistDomains` set): the current, more restrictive behavior. A URL is
 *   allowed iff it matches an allowlist pattern (hostname or full URL, case-insensitive) —
 *   explicit approval always wins, even over a denylist match, letting a caller carve out one
 *   approved host from under a broader deny wildcard. Anything that doesn't match the allowlist
 *   is blocked either way (default-deny); the denylist (now including
 *   {@link LOCKDOWN_LOOPBACK_DENYLIST_PATTERNS}) only supplies a more specific block reason.
 *
 * `allowedFilePaths` is checked before either mode's logic, as a hard override scoped to
 * `file://` URLs only (see {@link isAllowedFilePath}).
 */
export class NavigationPolicy {
  private readonly allowlist: CompiledPattern[];
  private readonly denylist: CompiledPattern[];
  private readonly lockdown: boolean;
  private readonly allowedFilePaths: string[];

  private constructor(
    allowlist: CompiledPattern[],
    denylist: CompiledPattern[],
    lockdown: boolean,
    allowedFilePaths: string[],
  ) {
    this.allowlist = allowlist;
    this.denylist = denylist;
    this.lockdown = lockdown;
    this.allowedFilePaths = allowedFilePaths;
  }

  static create(options: NavigationPolicy.Options): NavigationPolicy {
    const lockdown = !!options.allowlistDomains?.length;

    const allowedFilePaths = (options.allowedFilePaths ?? []).map((entry) => {
      if (!path.posix.isAbsolute(entry)) {
        throw new NavigationPolicyConfigError(
          "allowedFilePaths",
          entry,
          "must be an absolute path",
        );
      }
      return path.posix.normalize(entry);
    });

    return new NavigationPolicy(
      compilePatterns(options.allowlistDomains ?? [], "allowlistDomains"),
      compilePatterns(
        [
          ...ALWAYS_ON_DENYLIST_PATTERNS,
          ...(lockdown ? LOCKDOWN_LOOPBACK_DENYLIST_PATTERNS : []),
          ...(options.denylistDomains ?? []),
        ],
        "denylistDomains",
      ),
      lockdown,
      allowedFilePaths,
    );
  }

  evaluate(url: string): NavigationPolicy.Evaluation {
    if (isAllowedFilePath(url, this.allowedFilePaths)) {
      return { allowed: true };
    }

    const hostname = extractHostname(url);
    const fullUrl = url.toLowerCase();
    // Unwrap an IPv4-mapped IPv6 literal (e.g. the WHATWG URL parser's canonical
    // "[::ffff:7f00:1]" form of "::ffff:127.0.0.1") so decimal-based patterns like "^127\." still
    // catch it — otherwise this hex encoding bypasses the denylist entirely (CVE-2026-49857 class).
    const unwrapped = unwrapIPv4MappedIPv6(hostname);
    const haystacks = unwrapped
      ? [hostname, fullUrl, unwrapped]
      : [hostname, fullUrl];

    if (this.lockdown && matchesAny(this.allowlist, haystacks)) {
      return { allowed: true };
    }

    const denyMatch = matchesAny(this.denylist, haystacks);
    if (denyMatch) {
      return {
        allowed: false,
        reason: `matches denylist pattern "${denyMatch.pattern}"`,
      };
    }

    if (this.lockdown) {
      return {
        allowed: false,
        reason: "does not match any allowlisted domain",
      };
    }

    return { allowed: true };
  }

  check(url: string): void {
    if (!url || url === "about:blank") return;

    const { allowed, reason } = this.evaluate(url);
    if (!allowed) {
      throw new NavigationBlockedError(
        url,
        reason ?? "blocked by domain policy",
      );
    }
  }
}
