import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Alumni } from "alumnium";
import { describe } from "vitest";
import { NavigationBlockedError } from "../../src/NavigationPolicy.ts";
import { baseIt } from "./helpers.ts";

// Real-browser wiring tests for NavigationPolicy. The exhaustive rule matrix (every
// allow/deny/mode/bypass permutation) is already covered, with zero flakiness risk, by pure
// `.evaluate()` calls in `src/NavigationPolicy.test.ts` — this file only proves that a real
// Playwright/Selenium driver's `visit()` (pre-navigation) and `BaseTool.executeToolCall`
// (post-invoke) actually enforce that logic end-to-end against a real browser.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(
  dirname,
  "../../../python/examples/support/pages",
);

// `https://example.com` (RFC 2606, IANA-reserved) is the one real external domain used
// throughout this file — its content is stable by design, so it's safe to depend on without
// asserting anything about page structure/content.
const ALLOWED_REAL_URL = "https://example.com/";

// A `file://` target (rather than e.g. a cloud-metadata IP) for hook #2's "blocked" cases —
// it's always-on-denylisted in both modes just the same, but resolves synchronously with no
// network I/O. A non-routable address like 169.254.169.254 leaves the browser hanging on a
// TCP connect() that never resolves, which then races the test's `al.quit()` teardown and
// throws an unrelated, unhandled CDP "target destroyed" error.
const BLOCKED_HOOK2_TARGET = "file:///etc/hostname";

function targetPageUrl(to: string): string {
  return `file://${fixturesDir}/navigation_target_page.html?to=${encodeURIComponent(to)}`;
}

function startLocalServer(
  onTestFinished: (fn: () => void) => void,
): Promise<{ port: number }> {
  return new Promise((resolve) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<title>Local Target</title><h1>Local Target</h1>");
    });
    server.listen(0, "127.0.0.1", () => {
      onTestFinished(() => {
        server.closeAllConnections();
        server.close();
      });
      resolve(server.address() as AddressInfo);
    });
  });
}

interface PreNavCase {
  label: string;
  options: Alumni.Options;
  url: string;
  expected: "allowed" | "blocked";
}

const preNavCases: PreNavCase[] = [
  // Open mode (no allowlistDomains): always-on denylist + arbitrary domains allowed.
  {
    label: "open: allows an arbitrary domain",
    options: {},
    url: ALLOWED_REAL_URL,
    expected: "allowed",
  },
  {
    label: "open: blocks cloud metadata (always-on denylist)",
    options: {},
    url: "http://169.254.169.254/latest/meta-data/instance-id",
    expected: "blocked",
  },
  {
    label: "open: blocks file:// (always-on denylist)",
    options: {},
    url: "file:///etc/hostname",
    expected: "blocked",
  },
  {
    label: "open: blocks IPv6 link-local (always-on denylist)",
    options: {},
    url: "http://[fe80::1]/",
    expected: "blocked",
  },
  {
    label:
      "open: blocks an IPv4-mapped-IPv6 metadata address (CVE-2026-49857 bypass class)",
    options: {},
    url: "http://[::ffff:169.254.169.254]/",
    expected: "blocked",
  },

  // Lockdown mode (allowlistDomains set): default-deny + loopback denylist apply.
  {
    label: "lockdown: allows a hostname matching the allowlist",
    options: { allowlistDomains: ["(^|\\.)example\\.com$"] },
    url: ALLOWED_REAL_URL,
    expected: "allowed",
  },
  {
    label: "lockdown: blocks loopback once allowlistDomains is set",
    options: { allowlistDomains: ["(^|\\.)example\\.com$"] },
    url: "http://127.0.0.1:9/",
    expected: "blocked",
  },
  {
    label: "lockdown: default-denies a domain matching neither list",
    options: { allowlistDomains: ["(^|\\.)example\\.com$"] },
    url: "https://www.wikipedia.org/",
    expected: "blocked",
  },

  // allowedFilePaths: hand-built file:// strings, since $.resolveUrl()/path.resolve() would
  // pre-collapse ".." before the string is even built, defeating the point of this case —
  // NavigationPolicy must itself end up blocking whatever prefix the URL ultimately resolves to.
  {
    label: "allowedFilePaths: blocks a file:// path outside any allowed prefix",
    options: {},
    url: "file:///tmp/alumnium-navigation-policy-test-outside-prefix.html",
    expected: "blocked",
  },
  {
    label:
      "allowedFilePaths: blocks a `..`-traversal attempt that would escape the allowed prefix",
    options: {},
    url: `file://${fixturesDir}/../../../../etc/passwd`,
    expected: "blocked",
  },
];

interface PostInvokeRedirectCase {
  label: string;
  options: Alumni.Options;
}

const postInvokeRedirectCases: PostInvokeRedirectCase[] = [
  { label: "open mode", options: {} },
  {
    label: "lockdown mode",
    options: { allowlistDomains: ["(^|\\.)example\\.com$"] },
  },
];

describe("NavigationPolicy", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      if (result.isAppiumDriver)
        skip("Navigation policy is verified for browsers only, not Appium");
      return result;
    };
  });

  describe("hook #1: pre-navigation check (driver.visit)", () => {
    for (const { label, options, url, expected } of preNavCases) {
      it(label, async ({ expect, setup }) => {
        const { al } = await setup(options);
        const before = await al.driver.url();

        if (expected === "allowed") {
          await expect(al.driver.visit(url)).resolves.toBeUndefined();
          expect(await al.driver.url()).toBe(url);
        } else {
          await expect(al.driver.visit(url)).rejects.toThrow(
            NavigationBlockedError,
          );
          // The check runs strictly before the browser issues any request, so the URL must be
          // unchanged — unlike the post-invoke hook (see below), this is a true preventer.
          expect(await al.driver.url()).toBe(before);
        }
      });
    }

    it("allowedFilePaths: allows a file:// path under the fixture directory it already grants", async ({
      expect,
      setup,
    }) => {
      const { al, $ } = await setup();

      await $.navigate("multi_tab_page.html");

      expect(await al.driver.title()).toBe("Multi-Tab Test Page");
    });

    it("open: allows loopback (common for local test servers)", async ({
      expect,
      setup,
      onTestFinished,
    }) => {
      const { al } = await setup();
      const { port } = await startLocalServer(onTestFinished);

      await expect(
        al.driver.visit(`http://127.0.0.1:${port}/`),
      ).resolves.toBeUndefined();
      expect(await al.driver.title()).toBe("Local Target");
    });

    it("open: does not block a mapped-loopback address (CVE-2026-49857 bypass class, allow side)", async ({
      expect,
      setup,
      onTestFinished,
    }) => {
      const { al } = await setup();
      const { port } = await startLocalServer(onTestFinished);

      await expect(
        al.driver.visit(`http://[::ffff:127.0.0.1]:${port}/`),
      ).resolves.toBeUndefined();
      expect(await al.driver.title()).toBe("Local Target");
    });

    // A non-absolute `allowedFilePaths` entry throwing `NavigationPolicyConfigError` at
    // construction is exhaustively covered (with zero fixture setup needed) by
    // `NavigationPolicy.test.ts`'s unit suite. It can't be exercised here: `useSetup()`
    // unconditionally overwrites `allowedFilePaths` with the fixture directory it needs for
    // every other test in this file, so a custom value passed via `setup(options)` never
    // reaches `NavigationPolicy.create()`.
  });

  describe("hook #2: post-invoke check (BaseTool.executeToolCall)", () => {
    for (const { label, options } of postInvokeRedirectCases) {
      it(`${label}: a click that JS-redirects to a blocked target throws, after the click's own side effect already ran`, async ({
        expect,
        setup,
      }) => {
        const { al } = await setup(options);

        await al.driver.visit(targetPageUrl(BLOCKED_HOOK2_TARGET));

        await expect(al.do("click on 'Redirect Here' button")).rejects.toThrow(
          NavigationBlockedError,
        );

        // Post-invoke means the click already fired and the redirect already started —
        // unlike the pre-navigation hook above, the URL DOES reflect the blocked target here.
        expect(await al.driver.url()).toBe(BLOCKED_HOOK2_TARGET);
      });
    }

    it("a click that navigates same-tab to an allowed target succeeds", async ({
      expect,
      setup,
    }) => {
      const { al } = await setup();

      await al.driver.visit(targetPageUrl(ALLOWED_REAL_URL));
      await expect(
        al.do("click on 'Redirect Here' button"),
      ).resolves.not.toThrow();

      expect(await al.driver.url()).toBe(ALLOWED_REAL_URL);
    });

    it("a click that opens a new tab pointed at a blocked target throws", async ({
      expect,
      setup,
    }) => {
      const { al } = await setup();

      await al.driver.visit(targetPageUrl(BLOCKED_HOOK2_TARGET));

      await expect(al.do("click on 'Open Tab Here' button")).rejects.toThrow(
        NavigationBlockedError,
      );
      expect(await al.driver.url()).toBe(BLOCKED_HOOK2_TARGET);
    });

    it("a click that opens a new tab pointed at an allowed target succeeds", async ({
      expect,
      setup,
    }) => {
      const { al } = await setup();

      await al.driver.visit(targetPageUrl(ALLOWED_REAL_URL));
      await expect(
        al.do("click on 'Open Tab Here' button"),
      ).resolves.not.toThrow();

      expect(await al.driver.url()).toBe(ALLOWED_REAL_URL);
    });
  });
});
