import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe } from "vitest";
import { NavigationBlockedError } from "../../src/NavigationPolicy.ts";
import { baseIt } from "./helpers.ts";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(
  dirname,
  "../../../python/examples/support/pages",
);

const ALLOWED_REAL_URL = "https://example.com/";
const LOCAL_FILE_URL = "file:///etc/hosts";
const LOCKDOWN_OPTIONS = {
  navigationPolicy: { allowedDomains: ["(^|\\.)example\\.com$"] },
};

describe("NavigationPolicy", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      if (result.isAppiumDriver)
        skip("Navigation policy is verified for browsers only, not Appium");
      return result;
    };
  });

  describe("pre-navigation check", () => {
    describe("open mode (no allowedDomains)", () => {
      it("allows an arbitrary domain", async ({ expect, setup }) => {
        const { al, $ } = await setup();
        await $.navigate(ALLOWED_REAL_URL);
        expect(await al.driver.url()).toBe(ALLOWED_REAL_URL);
      });

      it("allows loopback (common for local test servers)", async ({
        expect,
        setup,
      }) => {
        const { al, $ } = await setup();
        const { url } = await $.serve();

        await $.navigate(url);
        expect(await al.driver.title()).toBe("Local Target");
      });

      it("does not block a mapped-loopback address (CVE-2026-49857)", async ({
        expect,
        setup,
      }) => {
        const { al, $ } = await setup();
        const { url } = await $.serve();

        await $.navigate(url.replace("127.0.0.1", "[::ffff:127.0.0.1]"));
        expect(await al.driver.title()).toBe("Local Target");
      });

      it("blocks cloud metadata", async ({ expect, setup }) => {
        const { al, $ } = await setup();
        const before = await al.driver.url();

        await expect(
          $.navigate("http://169.254.169.254/latest/meta-data/instance-id"),
        ).rejects.toThrow(NavigationBlockedError);
        expect(await al.driver.url()).toBe(before);
      });

      it("blocks file://", async ({ expect, setup }) => {
        const { al, $ } = await setup();
        const before = await al.driver.url();

        await expect($.navigate("file:///etc/hostname")).rejects.toThrow(
          NavigationBlockedError,
        );
        expect(await al.driver.url()).toBe(before);
      });

      it("blocks IPv6 link-local", async ({ expect, setup }) => {
        const { al, $ } = await setup();
        const before = await al.driver.url();

        await expect($.navigate("http://[fe80::1]/")).rejects.toThrow(
          NavigationBlockedError,
        );
        expect(await al.driver.url()).toBe(before);
      });

      it("blocks an IPv4-mapped-IPv6 metadata address (CVE-2026-49857)", async ({
        expect,
        setup,
      }) => {
        const { al, $ } = await setup();
        const before = await al.driver.url();

        await expect(
          $.navigate("http://[::ffff:169.254.169.254]/"),
        ).rejects.toThrow(NavigationBlockedError);
        expect(await al.driver.url()).toBe(before);
      });
    });

    describe("lockdown mode (allowedDomains set)", () => {
      it("allows a hostname matching the allowlist", async ({
        expect,
        setup,
      }) => {
        const { al, $ } = await setup(LOCKDOWN_OPTIONS);
        await $.navigate(ALLOWED_REAL_URL);
        expect(await al.driver.url()).toBe(ALLOWED_REAL_URL);
      });

      it("blocks loopback once allowedDomains is set", async ({
        expect,
        setup,
      }) => {
        const { al, $ } = await setup(LOCKDOWN_OPTIONS);
        const before = await al.driver.url();

        await expect($.navigate("http://127.0.0.1:9/")).rejects.toThrow(
          NavigationBlockedError,
        );
        expect(await al.driver.url()).toBe(before);
      });

      it("default-denies a domain matching neither list", async ({
        expect,
        setup,
      }) => {
        const { al, $ } = await setup(LOCKDOWN_OPTIONS);
        const before = await al.driver.url();

        await expect($.navigate("https://www.wikipedia.org/")).rejects.toThrow(
          NavigationBlockedError,
        );
        expect(await al.driver.url()).toBe(before);
      });
    });

    describe("allowedFilePaths", () => {
      it("allows a file:// path under the fixture directory it already grants", async ({
        expect,
        setup,
      }) => {
        const { al, $ } = await setup();
        await $.navigate("multi_tab_page.html");
        expect(await al.driver.title()).toBe("Multi-Tab Test Page");
      });

      it("blocks a file:// path outside any allowed prefix", async ({
        expect,
        setup,
      }) => {
        const { al, $ } = await setup();
        const before = await al.driver.url();

        await expect(
          $.navigate(
            "file:///tmp/alumnium-navigation-policy-test-outside-prefix.html",
          ),
        ).rejects.toThrow(NavigationBlockedError);
        expect(await al.driver.url()).toBe(before);
      });

      it("blocks a `..`-traversal attempt that would escape the allowed prefix", async ({
        expect,
        setup,
      }) => {
        const { al, $ } = await setup();
        const before = await al.driver.url();

        await expect(
          $.navigate(`file://${fixturesDir}/../../../../etc/hosts`),
        ).rejects.toThrow(NavigationBlockedError);
        expect(await al.driver.url()).toBe(before);
      });
    });
  });

  describe("post-invoke check", () => {
    it("a click that JS-redirects to a blocked target throws, after the click's own side effect already ran", async ({
      expect,
      setup,
    }) => {
      const { al, $ } = await setup();

      await $.navigate(`navigation_target_page.html?to=${LOCAL_FILE_URL}`);

      await expect(al.do("click on 'Redirect Here' button")).rejects.toThrow(
        NavigationBlockedError,
      );
      expect(await al.driver.url()).toBe(LOCAL_FILE_URL);
    });

    it("a click that navigates same-tab to an allowed target succeeds", async ({
      expect,
      setup,
    }) => {
      const { al, $ } = await setup();

      await $.navigate(`navigation_target_page.html?to=${ALLOWED_REAL_URL}`);
      await al.do("click on 'Redirect Here' button");

      expect(await al.driver.url()).toBe(ALLOWED_REAL_URL);
    });

    it("a click that opens a new tab pointed at a blocked target throws", async ({
      expect,
      setup,
    }) => {
      const { al, $ } = await setup();

      await $.navigate(`navigation_target_page.html?to=${LOCAL_FILE_URL}`);

      await expect(al.do("click on 'Open Tab Here' button")).rejects.toThrow(
        NavigationBlockedError,
      );
      expect(await al.driver.url()).toBe(LOCAL_FILE_URL);
    });

    it("a click that opens a new tab pointed at an allowed target succeeds", async ({
      expect,
      setup,
    }) => {
      const { al, $ } = await setup();

      await $.navigate(`navigation_target_page.html?to=${ALLOWED_REAL_URL}`);
      await al.do("click on 'Open Tab Here' button");

      expect(await al.driver.url()).toBe(ALLOWED_REAL_URL);
    });
  });
});
