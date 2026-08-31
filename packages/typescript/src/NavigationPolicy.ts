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

type PolicyField = "allowlistDomains" | "denylistDomains";

/**
 * Thrown by {@link NavigationPolicy.create} when a caller-supplied pattern string fails to
 * compile as a regular expression.
 */
export class NavigationPolicyConfigError extends Error {
  constructor(field: PolicyField, pattern: string, cause: unknown) {
    super(`Invalid regex pattern "${pattern}" in ${field}: ${cause}`);
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

function compilePatterns(patterns: string[], field: PolicyField): RegExp[] {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern, "i");
    } catch (error) {
      throw new NavigationPolicyConfigError(field, pattern, error);
    }
  });
}

function matchesAny(
  patterns: RegExp[],
  haystacks: string[],
): RegExp | undefined {
  return patterns.find((pattern) =>
    haystacks.some((haystack) => pattern.test(haystack)),
  );
}

export namespace NavigationPolicy {
  export interface Options {
    allowlistDomains?: string[] | undefined;
    denylistDomains?: string[] | undefined;
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
 */
export class NavigationPolicy {
  private readonly allowlist: RegExp[];
  private readonly denylist: RegExp[];
  private readonly lockdown: boolean;

  private constructor(
    allowlist: RegExp[],
    denylist: RegExp[],
    lockdown: boolean,
  ) {
    this.allowlist = allowlist;
    this.denylist = denylist;
    this.lockdown = lockdown;
  }

  static create(options: NavigationPolicy.Options): NavigationPolicy {
    const lockdown = !!options.allowlistDomains?.length;

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
    );
  }

  evaluate(url: string): NavigationPolicy.Evaluation {
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
        reason: `matches denylist pattern "${denyMatch.source}"`,
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
