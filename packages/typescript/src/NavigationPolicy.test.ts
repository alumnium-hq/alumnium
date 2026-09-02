import { describe, expect, it } from "vitest";
import {
  NavigationBlockedError,
  NavigationPolicy,
  NavigationPolicyConfigError,
} from "./NavigationPolicy.ts";

describe(NavigationPolicy, () => {
  describe("create", () => {
    it("returns a real instance even with no options (always-on protection, no opt-out)", () => {
      expect(NavigationPolicy.create({})).toBeInstanceOf(NavigationPolicy);
    });

    it("returns a real instance when allowedDomains is empty", () => {
      expect(NavigationPolicy.create({ allowedDomains: [] })).toBeInstanceOf(
        NavigationPolicy,
      );
    });

    it("throws NavigationPolicyConfigError on an invalid allowlist pattern", () => {
      expect(() =>
        NavigationPolicy.create({ allowedDomains: ["(unterminated"] }),
      ).toThrow(NavigationPolicyConfigError);
    });

    it("throws NavigationPolicyConfigError on an invalid denylist pattern, even without allowedDomains", () => {
      expect(() =>
        NavigationPolicy.create({ deniedDomains: ["(unterminated"] }),
      ).toThrow(NavigationPolicyConfigError);
    });
  });

  describe("open mode (no allowedDomains)", () => {
    const policy = () => NavigationPolicy.create({});

    it("allows an arbitrary domain", () => {
      expect(policy().evaluate("https://example.org")).toEqual({
        allowed: true,
      });
    });

    it.each([
      "http://localhost:3000/",
      "http://127.0.0.1:3000/",
      "http://[::1]/",
      "http://0.0.0.0:3000/",
    ])(
      "allows loopback address %s (common for local test servers)",
      (url: string) => {
        expect(policy().evaluate(url).allowed).toBe(true);
      },
    );

    it("still blocks the always-on denylist: cloud metadata", () => {
      expect(
        policy().evaluate("http://169.254.169.254/latest/meta-data").allowed,
      ).toBe(false);
    });

    it("still blocks the always-on denylist: file://", () => {
      expect(policy().evaluate("file:///etc/passwd").allowed).toBe(false);
    });

    it("still blocks IPv4-mapped IPv6 metadata (CVE-2026-49857 bypass class)", () => {
      expect(policy().evaluate("http://[::ffff:a9fe:a9fe]/").allowed).toBe(
        false,
      );
    });

    it("does not block a mapped loopback address (loopback isn't in the always-on tier)", () => {
      expect(policy().evaluate("http://[::ffff:127.0.0.1]/").allowed).toBe(
        true,
      );
    });

    it("enforces caller-supplied deniedDomains even without allowedDomains", () => {
      const p = NavigationPolicy.create({
        deniedDomains: ["(^|\\.)a\\.musta\\.ch$"],
      });
      expect(p.evaluate("https://ci.a.musta.ch").allowed).toBe(false);
    });
  });

  describe("lockdown mode (allowedDomains set)", () => {
    const policy = () =>
      NavigationPolicy.create({
        allowedDomains: ["(^|\\.)airbnb\\.com$"],
        deniedDomains: ["(^|\\.)a\\.musta\\.ch$"],
      });

    it("allows a hostname matching the allowlist", () => {
      expect(policy().evaluate("https://www.airbnb.com/rooms/1")).toEqual({
        allowed: true,
      });
    });

    it("blocks a typo-squat that doesn't match the anchored allowlist pattern", () => {
      expect(policy().evaluate("https://wairbnb.com").allowed).toBe(false);
    });

    it("blocks a denylist match with a reason naming the pattern", () => {
      const result = policy().evaluate("https://ci.a.musta.ch");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("a\\.musta\\.ch");
    });

    it("default-denies a URL matching neither list", () => {
      const result = policy().evaluate("https://example.org");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("does not match any allowlisted domain");
    });

    it("lets an explicit allowlist match override a broader denylist match", () => {
      const p = NavigationPolicy.create({
        allowedDomains: ["(^|\\.)airbnb\\.com$", "(^|\\.)ci\\.a\\.musta\\.ch$"],
        deniedDomains: ["(^|\\.)a\\.musta\\.ch$"],
      });
      expect(p.evaluate("https://ci.a.musta.ch")).toEqual({ allowed: true });
    });

    it("matches file:// via the full URL, not the hostname", () => {
      expect(policy().evaluate("file:///etc/passwd").allowed).toBe(false);
      expect(policy().evaluate("file:///etc/passwd").reason).toContain(
        "file://",
      );
    });

    it("blocks loopback addresses once allowedDomains is set", () => {
      expect(policy().evaluate("http://127.0.0.1/").allowed).toBe(false);
      expect(policy().evaluate("http://localhost:3000/").allowed).toBe(false);
      expect(policy().evaluate("http://[::1]/").allowed).toBe(false);
      expect(policy().evaluate("http://0.0.0.0:3000/").allowed).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(policy().evaluate("https://WWW.AIRBNB.COM/").allowed).toBe(true);
    });

    it("blocks the built-in denylist even with no custom deniedDomains", () => {
      const p = NavigationPolicy.create({
        allowedDomains: ["(^|\\.)airbnb\\.com$"],
      });
      expect(
        p.evaluate("http://169.254.169.254/latest/meta-data").allowed,
      ).toBe(false);
    });

    // CVE-2026-49857 bypass class: an IPv4-mapped IPv6 literal like "::ffff:127.0.0.1" is
    // normalized by the WHATWG URL parser to hex-encoded "::ffff:7f00:1" before this code ever
    // sees it, which a decimal-only denylist pattern ("^127\.") wouldn't otherwise catch.
    describe("IPv4-mapped IPv6 bypass", () => {
      it.each([
        ["http://[::ffff:127.0.0.1]/", "dotted-decimal form"],
        ["http://[::ffff:7f00:1]/", "already-hex form"],
        ["http://[0:0:0:0:0:ffff:127.0.0.1]/", "uncompressed form"],
        ["http://[::ffff:127.0.0.1]:31337/", "with a port"],
        ["http://[::ffff:169.254.169.254]/", "cloud metadata, dotted"],
        ["http://[::ffff:a9fe:a9fe]/", "cloud metadata, hex"],
      ])("blocks %s (%s)", (url: string) => {
        expect(policy().evaluate(url).allowed).toBe(false);
      });

      it("does not falsely flag a mapped address that isn't denylisted", () => {
        const result = policy().evaluate("http://[::ffff:8.8.8.8]/");
        expect(result).toEqual({
          allowed: false,
          reason: "does not match any allowlisted domain",
        });
      });

      it("does not crash on an unrelated (non-mapped) IPv6 literal", () => {
        expect(() => policy().evaluate("http://[2001:db8::1]/")).not.toThrow();
      });
    });
  });

  describe("allowedFilePaths", () => {
    it("throws NavigationPolicyConfigError on a non-absolute entry", () => {
      expect(() =>
        NavigationPolicy.create({ allowedFilePaths: ["relative/pages"] }),
      ).toThrow(NavigationPolicyConfigError);
    });

    it("allows a file:// URL under the prefix in open mode", () => {
      const p = NavigationPolicy.create({
        allowedFilePaths: ["/repo/pages"],
      });
      expect(p.evaluate("file:///repo/pages/login.html")).toEqual({
        allowed: true,
      });
    });

    it("allows a file:// URL under the prefix in lockdown mode too", () => {
      const p = NavigationPolicy.create({
        allowedDomains: ["(^|\\.)airbnb\\.com$"],
        allowedFilePaths: ["/repo/pages"],
      });
      expect(p.evaluate("file:///repo/pages/login.html")).toEqual({
        allowed: true,
      });
    });

    it("still blocks a file:// URL outside any configured prefix", () => {
      const p = NavigationPolicy.create({
        allowedFilePaths: ["/repo/pages"],
      });
      expect(p.evaluate("file:///tmp/secrets.json").allowed).toBe(false);
    });

    it("still blocks a ..-traversal attempt that normalizes outside the prefix", () => {
      const p = NavigationPolicy.create({
        allowedFilePaths: ["/repo/pages"],
      });
      expect(p.evaluate("file:///repo/pages/../../etc/passwd").allowed).toBe(
        false,
      );
    });

    it("does not treat a same-prefix-string sibling directory as allowed", () => {
      const p = NavigationPolicy.create({
        allowedFilePaths: ["/repo/pages"],
      });
      expect(p.evaluate("file:///repo/pages-evil/x.html").allowed).toBe(false);
    });

    it("does not affect non-file:// URLs", () => {
      const p = NavigationPolicy.create({
        allowedDomains: ["(^|\\.)airbnb\\.com$"],
        allowedFilePaths: ["/repo/pages"],
      });
      expect(p.evaluate("https://evil.example.com").allowed).toBe(false);
    });
  });

  describe("check", () => {
    const policy = () =>
      NavigationPolicy.create({ allowedDomains: ["(^|\\.)airbnb\\.com$"] });

    it("no-ops on an empty URL", () => {
      expect(() => policy().check("")).not.toThrow();
    });

    it("no-ops on about:blank", () => {
      expect(() => policy().check("about:blank")).not.toThrow();
    });

    it("does not throw for an allowed URL", () => {
      expect(() => policy().check("https://airbnb.com/")).not.toThrow();
    });

    it("throws NavigationBlockedError naming the URL and reason for a blocked URL", () => {
      try {
        policy().check("https://evil.example.com");
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(NavigationBlockedError);
        expect((error as Error).message).toContain("https://evil.example.com");
        expect((error as Error).message).toContain(
          "does not match any allowlisted domain",
        );
      }
    });
  });
});
