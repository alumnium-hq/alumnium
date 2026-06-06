import type { CodeLanguage } from "astro";
import { lit } from "smollit";

export const ttHow = {
  //#region Install

  //#region Install/CLI

  "install-cli-bin": {
    tab: "CLI",
  },

  "install-cli-bin-xnix": installVar({
    tab: "macOS/Linux",

    install: {
      lang: "bash",
      code: "curl -LsSf https://alumnium.ai/install.sh | sh",
    },
  }),

  "install-cli-bin-windows": installVar({
    tab: "Windows",

    install: {
      lang: "powershell",
      code: "irm https://alumnium.ai/install.ps1 | iex",
    },
  }),

  "install-cli-npm": {
    tab: "npm",
  },

  "install-cli-npm-npm": installVar({
    tab: "npm",

    install: {
      lang: "bash",
      code: "npm install alumnium",
    },
  }),

  "install-cli-npm-pnpm": installVar({
    tab: "pnpm",

    install: {
      lang: "bash",
      code: "pnpm add alumnium",
    },
  }),

  "install-cli-npm-yarn": installVar({
    tab: "Yarn",

    install: {
      lang: "bash",
      code: "yarn add alumnium",
    },
  }),

  "install-cli-npm-bun": installVar({
    tab: "Bun",

    install: {
      lang: "bash",
      code: "bun add alumnium",
    },
  }),

  "install-cli-pip": {
    tab: "Pip",
  },

  "install-cli-pip-pip": installVar({
    tab: "pip",

    install: {
      lang: "bash",
      code: "pip install alumnium",
    },
  }),

  "install-cli-pip-uv": installVar({
    tab: "uv",

    install: {
      lang: "bash",
      code: "uviw alumnium",
    },
  }),

  //#endregion

  //#region Install/Client

  "install-client-npm": {
    tab: "TypeScript",
  },

  "install-client-npm-npm": installVar({
    tab: "npm",

    install: {
      lang: "bash",
      code: "npm install alumnium",
    },
  }),

  "install-client-npm-pnpm": installVar({
    tab: "pnpm",

    install: {
      lang: "bash",
      code: "pnpm add alumnium",
    },
  }),

  "install-client-npm-yarn": installVar({
    tab: "Yarn",

    install: {
      lang: "bash",
      code: "yarn add alumnium",
    },
  }),

  "install-client-npm-bun": installVar({
    tab: "Bun",

    install: {
      lang: "bash",
      code: "bun add alumnium",
    },
  }),

  "install-client-pip": {
    tab: "Python",
  },

  "install-client-pip-pip": installVar({
    tab: "pip",

    install: {
      lang: "bash",
      code: "pip install alumnium",
    },
  }),

  "install-client-pip-uv": installVar({
    tab: "uv",

    install: {
      lang: "bash",
      code: "uv add alumnium",
    },
  }),

  "install-client-java": {
    tab: "Java",
  },

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

export namespace TtHow {
  export type T = typeof ttHow;
  export type TKey = keyof T;

  export type Filter<FilterKey extends string, Constraint = {}> = {
    [Key in TKey]: Key extends `${FilterKey}-${string}`
      ? T[Key] extends Constraint
        ? Key
        : never
      : never;
  }[TKey];

  export interface InstallVariant {
    top?: boolean;
    tab: string;
    install: {
      lang: CodeLanguage;
      code: string;
    };
  }

  export interface CodeVariant<Kind extends string> {
    kind: Kind;
    lang: CodeLanguage;
    tab: string;
    code: string;
  }

  export interface SetUpClientVariant extends CodeVariant<"set-up-client"> {}

  export interface SetUpMcpVariant extends CodeVariant<"set-up-mcp"> {}

  export interface TestExampleVariant extends CodeVariant<"test-client-example"> {}
}

function installVar<Variant extends TtHow.InstallVariant>(
  variant: Variant,
): Variant {
  return variant;
}

function setUpClientVar<Variant extends TtHow.SetUpClientVariant>(
  variant: Omit<Variant, "kind">,
): Variant {
  return { ...variant, kind: "set-up-client" } as Variant;
}

function setUpMcpVar<Variant extends TtHow.SetUpMcpVariant>(
  variant: Omit<Variant, "kind">,
): Variant {
  return { ...variant, kind: "set-up-mcp" } as Variant;
}

function testExampleVar<Variant extends TtHow.TestExampleVariant>(
  variant: Omit<Variant, "kind">,
): Variant {
  return { ...variant, kind: "test-client-example" } as Variant;
}
