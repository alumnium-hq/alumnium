import path from "node:path";

/** SSRF denylist enforced on every session; cannot be disabled. */
const ALWAYS_ON_DENYLIST_PATTERNS: string[] = [
  "169\\.254\\.", // link-local IPs, incl. cloud metadata endpoints (AWS/GCP/Azure)
  "^\\[?fe80:", // IPv6 link-local
  "^file://",
];

export class NavigationPolicyConfigError extends Error {
  constructor(
    field: keyof NavigationPolicy.Options,
    value: string,
    cause: unknown,
  ) {
    super(`Invalid ${field} entry "${value}": ${cause}`);
    this.name = "NavigationPolicyConfigError";
  }
}

/** Thrown by {@link NavigationPolicy.check} when a URL is blocked. */
export class NavigationBlockedError extends Error {
  constructor(url: string, reason: string) {
    super(`Navigation to "${url}" blocked by domain policy (${reason})`);
    this.name = "NavigationBlockedError";
  }
}

export namespace NavigationPolicy {
  export interface Options {
    allowedDomains?: string[] | undefined;
    deniedDomains?: string[] | undefined;
    allowedFilePaths?: string[] | undefined;
  }

  export interface Evaluation {
    allowed: boolean;
    reason?: string;
  }
}

/** Keeps the original text for error messages (`RegExp#source` escapes "/"). */
interface CompiledPattern {
  pattern: string;
  regex: RegExp;
}

/**
 * Per-session allowlist/denylist for navigation targets. Patterns are case-insensitive regexes
 * matched against the hostname and the full URL.
 *
 * - Without `allowedDomains`: everything is allowed except denylist matches.
 * - With `allowedDomains`: only allowlist matches are allowed (an allowlist match beats a
 *   denylist match).
 *
 * `allowedFilePaths` overrides both for matching `file://` URLs.
 */
export class NavigationPolicy {
  readonly #allowlist: CompiledPattern[];
  readonly #denylist: CompiledPattern[];
  readonly #allowedFilePaths: string[];

  private constructor(
    allowlist: CompiledPattern[],
    denylist: CompiledPattern[],
    allowedFilePaths: string[],
  ) {
    this.#allowlist = allowlist;
    this.#denylist = denylist;
    this.#allowedFilePaths = allowedFilePaths;
  }

  get #lockdown(): boolean {
    return this.#allowlist.length > 0;
  }

  static create(options: NavigationPolicy.Options): NavigationPolicy {
    const allowlist = NavigationPolicy.#compilePatterns(
      options.allowedDomains ?? [],
      "allowedDomains",
    );
    const denylist = NavigationPolicy.#compilePatterns(
      [...ALWAYS_ON_DENYLIST_PATTERNS, ...(options.deniedDomains ?? [])],
      "deniedDomains",
    );
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

    return new NavigationPolicy(allowlist, denylist, allowedFilePaths);
  }

  evaluate(url: string): NavigationPolicy.Evaluation {
    if (this.#isAllowedFilePath(url)) return { allowed: true };

    const hostname = URL.parse(url)?.hostname.toLowerCase() ?? "";
    const haystacks = [hostname, url.toLowerCase()];
    const unwrapped = NavigationPolicy.#unwrapIPv4MappedIPv6(hostname);
    if (unwrapped) haystacks.push(unwrapped);

    const matches = (patterns: CompiledPattern[]) =>
      patterns.find((p) => haystacks.some((h) => p.regex.test(h)));

    if (matches(this.#allowlist)) return { allowed: true };

    const denied = matches(this.#denylist);
    if (denied) {
      return {
        allowed: false,
        reason: `matches denylist pattern "${denied.pattern}"`,
      };
    }

    return this.#lockdown
      ? { allowed: false, reason: "does not match any allowlisted domain" }
      : { allowed: true };
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

  static #compilePatterns(
    patterns: string[],
    field: keyof NavigationPolicy.Options,
  ): CompiledPattern[] {
    return patterns.map((pattern) => {
      try {
        return { pattern, regex: new RegExp(pattern, "i") };
      } catch (error) {
        throw new NavigationPolicyConfigError(field, pattern, error);
      }
    });
  }

  /**
   * Decodes an IPv4-mapped IPv6 hostname (`[::ffff:7f00:1]`) to dotted-decimal (`127.0.0.1`) so
   * IPv4 patterns still match it. The URL parser always emits the hex form (CVE-2026-49857).
   */
  static #unwrapIPv4MappedIPv6(hostname: string): string | null {
    const match = hostname.match(
      /^\[?(?:0:0:0:0:0|:):ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]?$/i,
    );
    if (!match) return null;
    const hi = parseInt(match[1]!, 16);
    const lo = parseInt(match[2]!, 16);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }

  #isAllowedFilePath(url: string): boolean {
    const parsed = URL.parse(url);
    if (parsed?.protocol !== "file:") return false;

    const normalized = path.posix.normalize(
      decodeURIComponent(parsed.pathname),
    );
    return this.#allowedFilePaths.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    );
  }
}
