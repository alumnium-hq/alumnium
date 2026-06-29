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
    code: "uviw alumnium",
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

  "install-client-java-mvn": installClientVar({
    tab: "Java",

    lang: "bash",
    code: "mvn dependency:get -D groupId=ai.alumnium -D artifactId=alumnium -D version=LATEST",
    meta: "version",
  }),

  //#endregion

  //#endregion

  //#region Set Up

  "set-up-client-ts": {
    tab: "TS",
  },

  "set-up-client-ts-selenium": setUpClientVar({
    tab: "Selenium",

    lang: "typescript",

    code: lit`
      import { Alumnium } from "alumnium";

      // TODO: Selenium example
    `,
  }),

  "set-up-client-ts-playwright": setUpClientVar({
    tab: "Playwright",

    lang: "typescript",

    code: lit`
      import { Alumnium } from "alumnium";

      // TODO: Playwright example
    `,
  }),

  "set-up-client-ts-appium": setUpClientVar({
    tab: "Appium",

    lang: "typescript",

    code: lit`
      import { Alumnium } from "alumnium";

      // TODO: Appium example
    `,
  }),

  "set-up-client-python": {
    tab: "Python",
  },

  "set-up-client-python-selenium": setUpClientVar({
    tab: "Selenium",

    lang: "python",

    code: lit`
      # TODO: Selenium example
    `,
  }),

  "set-up-client-python-playwright": setUpClientVar({
    tab: "Playwright",

    lang: "python",

    code: lit`
      # TODO: Playwright example
    `,
  }),

  "set-up-client-python-appium": setUpClientVar({
    tab: "Appium",

    lang: "python",

    code: lit`
      # TODO: Appium example
    `,
  }),

  "set-up-client-java": {
    tab: "Java",
  },

  "set-up-client-java-selenium": setUpClientVar({
    tab: "Selenium",

    lang: "java",

    code: lit`
      // TODO: Selenium example
    `,
  }),

  "set-up-client-java-playwright": setUpClientVar({
    tab: "Playwright",

    lang: "java",

    code: lit`
      // TODO: Playwright example
    `,
  }),

  "set-up-client-java-appium": setUpClientVar({
    tab: "Appium",

    lang: "java",

    code: lit`
      // TODO: Appium example
    `,
  }),

  "set-up-mcp-claude-code": setUpMcpVar({
    tab: "Claude Code",

    lang: "bash",

    code: lit`
      # TODO: Claude Code example
    `,
  }),

  "set-up-mcp-codex": setUpMcpVar({
    tab: "Codex",

    lang: "bash",

    code: lit`
      # TODO: Codex example
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
      // TODO: Selenium example
    `,
  }),

  "test-client-ts-playwright": testExampleVar({
    tab: "Playwright",

    lang: "typescript",

    code: lit`
      // TODO: Playwright example
    `,
  }),

  "test-client-ts-appium": testExampleVar({
    tab: "Appium",

    lang: "typescript",

    code: lit`
      // TODO: Appium example
    `,
  }),

  "test-client-python": {
    tab: "Python",
  },

  "test-client-python-selenium": testExampleVar({
    tab: "Selenium",

    lang: "python",

    code: lit`
      # TODO: Selenium example
    `,
  }),

  "test-client-python-playwright": testExampleVar({
    tab: "Playwright",

    lang: "python",

    code: lit`
      # TODO: Playwright example
    `,
  }),

  "test-client-python-appium": testExampleVar({
    tab: "Appium",

    lang: "python",

    code: lit`
      # TODO: Appium example
    `,
  }),

  "test-client-java": {
    tab: "Java",
  },

  "test-client-java-selenium": testExampleVar({
    tab: "Selenium",

    lang: "java",

    code: lit`
      // TODO: Selenium example
    `,
  }),

  "test-client-java-playwright": testExampleVar({
    tab: "Playwright",

    lang: "java",

    code: lit`
      // TODO: Playwright example
    `,
  }),

  "test-client-java-appium": testExampleVar({
    tab: "Appium",

    lang: "java",

    code: lit`
      // TODO: Appium example
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
