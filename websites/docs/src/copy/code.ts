import type { MetaData } from "#/data/meta";
import type { CodeLanguage } from "astro";
import { lit } from "smollit";

export const ttCode = {
  //#region Install

  //#region Install/CLI

  "install-cli-bin": {
    tab: "CLI",
  },

  "install-cli-bin-xnix": installCliVar({
    tab: "macOS/Linux",

    lang: "bash",
    code: "curl -LsSf https://alumnium.ai/install.sh | sh",
    meta: "bin",
  }),

  "install-cli-bin-windows": installCliVar({
    tab: "Windows",

    lang: "powershell",
    code: "irm https://alumnium.ai/install.ps1 | iex",
    meta: "bin",
  }),

  "install-cli-npm": {
    tab: "npm",
  },

  "install-cli-npm-npm": installCliVar({
    tab: "npm",

    lang: "bash",
    code: "npm install alumnium",
    meta: "bin",
  }),

  "install-cli-npm-pnpm": installCliVar({
    tab: "pnpm",

    lang: "bash",
    code: "pnpm add alumnium",
    meta: "bin",
  }),

  "install-cli-npm-yarn": installCliVar({
    tab: "Yarn",

    lang: "bash",
    code: "yarn add alumnium",
    meta: "bin",
  }),

  "install-cli-npm-bun": installCliVar({
    tab: "Bun",

    lang: "bash",
    code: "bun add alumnium",
    meta: "bin",
  }),

  "install-cli-pip": {
    tab: "Pip",
  },

  "install-cli-pip-pip": installCliVar({
    tab: "pip",

    lang: "bash",
    code: "pip install alumnium",
    meta: "bin",
  }),

  "install-cli-pip-uv": installCliVar({
    tab: "uv",

    lang: "bash",
    code: "uv tool install alumnium",
    meta: "bin",
  }),

  //#endregion

  //#region Install/Client

  "install-client-npm": {
    tab: "TypeScript",
  },

  "install-client-npm-npm": installClientVar({
    tab: "npm",

    lang: "bash",
    code: "npm install alumnium",
    meta: "npm",
  }),

  "install-client-npm-pnpm": installClientVar({
    tab: "pnpm",

    lang: "bash",
    code: "pnpm add alumnium",
    meta: "npm",
  }),

  "install-client-npm-yarn": installClientVar({
    tab: "Yarn",

    lang: "bash",
    code: "yarn add alumnium",
    meta: "npm",
  }),

  "install-client-npm-bun": installClientVar({
    tab: "Bun",

    lang: "bash",
    code: "bun add alumnium",
    meta: "npm",
  }),

  "install-client-pip": {
    tab: "Python",
  },

  "install-client-pip-pip": installClientVar({
    tab: "pip",

    lang: "bash",
    code: "pip install alumnium",
    meta: "pip",
  }),

  "install-client-pip-uv": installClientVar({
    tab: "uv",

    lang: "bash",
    code: "uv add alumnium",
    meta: "pip",
  }),

  "install-client-java": {
    tab: "Java",
  },

  "install-client-java-gradle": installClientVar({
    tab: "Gradle",

    lang: "java",
    code: lit`
      dependencies {
        testImplementation 'ai.alumnium:alumnium:0.21.0'
        testRuntimeOnly    'ai.alumnium:alumnium-cli-darwin-arm64:0.21.0'
        // Add other platforms as needed
      }`,
    meta: "version",
  }),

  "install-client-java-mvn": installClientVar({
    tab: "Maven",

    lang: "xml",
    code: lit`
      <dependencies>
        <dependency>
          <groupId>ai.alumnium</groupId>
          <artifactId>alumnium</artifactId>
          <version>0.21.0</version>
          <scope>test</scope>
        </dependency>
        <dependency>
          <groupId>ai.alumnium</groupId>
          <artifactId>alumnium-cli-darwin-arm64</artifactId>
          <version>0.21.0</version>
          <scope>test</scope>
        </dependency>
        <!-- Add other platforms as needed -->
      </dependencies>
    `,
    meta: "version",
  }),
  //#endregion

  //#endregion

  //#region Set Up

  "set-up-client-ts": {
    tab: "TypeScript",
  },

  "set-up-client-ts-selenium": setUpClientVar({
    tab: "Selenium",

    lang: "typescript",

    code: lit`
      import { strict as assert } from "assert";
      import { Alumni } from "alumnium";
      import { Builder, type WebDriver } from "selenium-webdriver";

      process.env.OPENAI_API_KEY = "...";

      describe("YouTube Search", () => {
        let al: Alumni;
        let driver: WebDriver;

        before(async () => {
          driver = await new Builder().forBrowser("chrome").build();
          al = new Alumni(driver);
        });

        after(async () => {
          await driver.quit();
          await al.quit();
        });
      });
    `,
  }),

  "set-up-client-ts-playwright": setUpClientVar({
    tab: "Playwright",

    lang: "typescript",

    code: lit`
      import { Alumni } from "alumnium";
      import { test, expect } from "@playwright/test";

      process.env.OPENAI_API_KEY = "...";

      test.describe("YouTube Search", async () => {
        let al: Alumni;

        test.beforeEach(async ({ page }) => {
          al = new Alumni(page);
        });

        test.afterEach(async () => {
          await al.quit();
        });
      });
    `,
  }),

  "set-up-client-ts-appium": setUpClientVar({
    tab: "Appium",

    lang: "typescript",

    code: lit`
      import { Alumni } from "alumnium";
      import { browser, expect } from "@wdio/globals";

      process.env.OPENAI_API_KEY = "...";

      describe("YouTube Search", () => {
        let al: Alumni;

        before(async () => {
          al = new Alumni(browser);
        });

        after(async () => {
          await al.quit();
        });
      });
    `,
  }),

  "set-up-client-python": {
    tab: "Python",
  },

  "set-up-client-python-selenium": setUpClientVar({
    tab: "Selenium",

    lang: "python",

    code: lit`
      from alumnium import Alumni
      from selenium.webdriver import Chrome
      from pytest import fixture

      @fixture
      def driver():
          driver = Chrome()
          yield driver
          driver.quit()

      @fixture
      def al(driver):
          al = Alumni(driver)
          yield al
          al.quit()
    `,
  }),

  "set-up-client-python-playwright": setUpClientVar({
    tab: "Playwright",

    lang: "python",

    code: lit`
      from alumnium import Alumni
      from pytest import fixture

      @fixture
      def al(page):
          al = Alumni(page)
          yield al
          al.quit()
    `,
  }),

  "set-up-client-python-appium": setUpClientVar({
    tab: "Appium",

    lang: "python",

    code: lit`
      from alumnium import Alumni
      from appium.webdriver.webdriver import WebDriver
      from pytest import fixture

      @fixture
      def driver():
          driver = WebDriver()
          yield driver
          driver.quit()

      @fixture
      def al(driver):
          al = Alumni(driver)
          yield al
          al.quit()
    `,
  }),

  "set-up-client-java": {
    tab: "Java",
  },

  "set-up-client-java-selenium": setUpClientVar({
    tab: "Selenium",

    lang: "java",

    code: lit`
      import static org.junit.jupiter.api.Assertions.assertEquals;

      import ai.alumnium.Alumni;
      import org.junit.jupiter.api.AfterEach;
      import org.junit.jupiter.api.BeforeEach;
      import org.junit.jupiter.api.Test;
      import org.openqa.selenium.chrome.ChromeDriver;

      class SearchTest {
        private Alumni al;
        private ChromeDriver driver;

        @BeforeEach
        void setUp() {
          driver = new ChromeDriver();
          al = new Alumni(driver);
        }

        @AfterEach
        void tearDown() {
          driver.quit();
          al.quit();
        }
      }
    `,
  }),

  "set-up-client-java-playwright": setUpClientVar({
    tab: "Playwright",

    lang: "java",

    code: lit`
      import static org.junit.jupiter.api.Assertions.assertEquals;

      import ai.alumnium.Alumni;
      import com.microsoft.playwright.Page;
      import com.microsoft.playwright.junit.UsePlaywright;
      import org.junit.jupiter.api.AfterEach;
      import org.junit.jupiter.api.BeforeEach;
      import org.junit.jupiter.api.Test;

      @UsePlaywright
      class SearchTest {
        private Alumni al;

        @BeforeEach
        void setUp(Page page) {
          al = new Alumni(page);
        }

        @AfterEach
        void tearDown() {
          al.quit();
        }
      }
    `,
  }),

  "set-up-client-java-appium": setUpClientVar({
    tab: "Appium",

    lang: "java",

    code: lit`
      import static org.junit.jupiter.api.Assertions.assertEquals;

      import ai.alumnium.Alumni;
      import io.appium.java_client.ios.IOSDriver;
      import org.junit.jupiter.api.AfterEach;
      import org.junit.jupiter.api.BeforeEach;
      import org.junit.jupiter.api.Test;

      class SearchTest {
        private Alumni al;
        private IOSDriver driver;

        @BeforeEach
        void setUp() throws Exception {
          driver = new IOSDriver(/* pass options as needed */);
          al = new Alumni(driver);
        }

        @AfterEach
        void tearDown() {
          driver.quit();
          al.quit();
        }
      }
    `,
  }),

  "set-up-mcp-claude-code": setUpMcpVar({
    tab: "Claude Code",

    lang: "bash",

    code: lit`
      claude mcp add alumnium --env OPENAI_API_KEY=... -- \\
          alumnium mcp
    `,
  }),

  "set-up-mcp-codex": setUpMcpVar({
    tab: "Codex",

    lang: "bash",

    code: lit`
      codex mcp add alumnium --env ALUMNIUM_MODEL=codex -- \\
          alumnium mcp
    `,
  }),

  //#endregion

  //#region Test

  "code-test-client": {},

  "test-client-ts": {
    tab: "TypeScript",
  },

  "test-client-ts-selenium": testExampleVar({
    tab: "Selenium",

    lang: "typescript",

    code: lit`
      describe("YouTube Search", () => {
        it("queries videos", async () => {
          await driver.get("https://youtube.com");
          await al.do("search for 'lofi beats' and press Enter");
          await al.check("page title contains 'lofi beats'");
          await al.check("search results contain lofi videos");
        });
      });
    `,
  }),

  "test-client-ts-playwright": testExampleVar({
    tab: "Playwright",

    lang: "typescript",

    code: lit`
      test.describe("YouTube Search", async () => {
        test("queries videos", async ({ page }) => {
          await page.goto("https://youtube.com");
          await al.do("search for 'lofi beats' and press Enter");
          await al.check("page title contains 'lofi beats'");
          await al.check("search results contain lofi videos");
        });
      });
    `,
  }),

  "test-client-ts-appium": testExampleVar({
    tab: "Appium",

    lang: "typescript",

    code: lit`
      describe("YouTube Search", () => {
        it("queries videos", async () => {
          await browser.url("https://youtube.com");
          await al.do("search for 'lofi beats' and press Enter");
          await al.check("page title contains 'lofi beats'");
          await al.check("search results contain lofi videos");
        });
      });
    `,
  }),

  "test-client-python": {
    tab: "Python",
  },

  "test-client-python-selenium": testExampleVar({
    tab: "Selenium",

    lang: "python",

    code: lit`
      def test_search(al, driver):
          driver.get("https://youtube.com")
          al.do("search for 'lofi beats' and press Enter")
          al.check("page title contains 'lofi beats'")
          al.check("search results contain lofi videos")
    `,
  }),

  "test-client-python-playwright": testExampleVar({
    tab: "Playwright",

    lang: "python",

    code: lit`
      def test_search(al, page):
          page.goto("https://youtube.com")
          al.do("search for 'lofi beats' and press Enter")
          al.check("page title contains 'lofi beats'")
          al.check("search results contain lofi videos")
    `,
  }),

  "test-client-python-appium": testExampleVar({
    tab: "Appium",

    lang: "python",

    code: lit`
      def test_search(al, driver):
          driver.get("https://youtube.com")
          al.do("search for 'lofi beats' and press Enter")
          al.check("page title contains 'lofi beats'")
          al.check("search results contain lofi videos")
    `,
  }),

  "test-client-java": {
    tab: "Java",
  },

  "test-client-java-selenium": testExampleVar({
    tab: "Selenium",

    lang: "java",

    code: lit`
      class YouTubeSearchTest {
        @Test
        void queriesVideos() {
          driver.get("https://youtube.com");
          al.act("search for 'lofi beats' and press Enter");
          al.check("page title contains 'lofi beats'");
          al.check("search results contain lofi videos");
        }
      }
    `,
  }),

  "test-client-java-playwright": testExampleVar({
    tab: "Playwright",

    lang: "java",

    code: lit`
      class YouTubeSearchTest {
        @Test
        void queriesVideos() {
          page.navigate("https://youtube.com");
          al.act("search for 'lofi beats' and press Enter");
          al.check("page title contains 'lofi beats'");
          al.check("search results contain lofi videos");
        }
      }
    `,
  }),

  "test-client-java-appium": testExampleVar({
    tab: "Appium",

    lang: "java",

    code: lit`
      class YouTubeSearchTest {
        @Test
        void queriesVideos() {
          driver.get("https://youtube.com");
          al.act("search for 'lofi beats' and press Enter");
          al.check("page title contains 'lofi beats'");
          al.check("search results contain lofi videos");
        }
      }
    `,
  }),

  //#endregion
};

export namespace TtCode {
  export type T = typeof ttCode;
  export type TKey = keyof T;
  export type Id = {
    [Key in TKey]: Key extends `code-${infer Rest}` ? Rest : never;
  }[TKey];

  export type FilterKey<Base extends string, Constraint = {}> = {
    [Key in TKey]: Key extends `${Base}-${string}`
      ? T[Key] extends Constraint
        ? Key
        : never
      : never;
  }[TKey];

  export type CodeVariantKey = {
    [Key in TKey]: T[Key] extends CodeVariant<string> ? Key : never;
  }[TKey];

  export interface TabVariant<Kind extends string> {
    kind: Kind;
    tab: string;
  }

  export interface CodeVariant<Kind extends string> extends TabVariant<Kind> {
    lang: CodeLanguage;
    code: string;
    meta?: MetaData.SourceName;
  }

  export interface InstallCliVariant extends CodeVariant<"install-cli"> {}

  export interface InstallClientVariant extends CodeVariant<"install-client"> {}

  export interface SetUpMcpVariant extends CodeVariant<"set-up-mcp"> {}

  export interface SetUpClientVariant extends CodeVariant<"set-up-client"> {}

  export interface TestExampleVariant extends CodeVariant<"test-client-example"> {}
}

function installCliVar<Variant extends TtCode.InstallCliVariant>(
  variant: Omit<Variant, "kind">,
): Variant {
  return { ...variant, kind: "install-cli" } as Variant;
}

function installClientVar<Variant extends TtCode.InstallClientVariant>(
  variant: Omit<Variant, "kind">,
): Variant {
  return { ...variant, kind: "install-client" } as Variant;
}

function setUpClientVar<Variant extends TtCode.SetUpClientVariant>(
  variant: Omit<Variant, "kind">,
): Variant {
  return { ...variant, kind: "set-up-client" } as Variant;
}

function setUpMcpVar<Variant extends TtCode.SetUpMcpVariant>(
  variant: Omit<Variant, "kind">,
): Variant {
  return { ...variant, kind: "set-up-mcp" } as Variant;
}

function testExampleVar<Variant extends TtCode.TestExampleVariant>(
  variant: Omit<Variant, "kind">,
): Variant {
  return { ...variant, kind: "test-client-example" } as Variant;
}
