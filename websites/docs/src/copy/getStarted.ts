import type { CodeLanguage } from "astro";
import { lit } from "smollit";

export const ttGetStarted = {
  "cli-bin": {
    tab: "CLI",
  },

  "cli-bin-xnix": installVar({
    tab: "macOS/Linux",

    install: {
      lang: "bash",
      code: "curl -LsSf https://alumnium.ai/install.sh | sh",
    },
  }),

  "cli-bin-windows": installVar({
    tab: "Windows",

    install: {
      lang: "powershell",
      code: "irm https://alumnium.ai/install.ps1 | iex",
    },
  }),

  "cli-npm": {
    tab: "npm",
  },

  "cli-npm-npm": {
    install: {
      code: "npm install alumnium",
    },
  },

  "cli-npm-pnpm": {
    install: {
      code: "pnpm add alumnium",
    },
  },

  "cli-npm-yarn": {
    install: {
      code: "yarn add alumnium",
    },
  },

  "cli-npm-bun": {
    install: {
      code: "bun add alumnium",
    },
  },

  "cli-pip": {
    tab: "Pip",
  },

  "cli-pip-pip": {
    install: {
      code: "pip install alumnium",
    },
  },

  "cli-pip-uv": {
    install: {
      code: "uviw alumnium",
    },
  },

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

  "test-client-ts": {
    tab: "TS",
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
};

export namespace TtGetStarted {
  export interface InstallVariant {
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

function installVar<Variant extends TtGetStarted.InstallVariant>(
  variant: Variant,
): Variant {
  return variant;
}

function setUpClientVar<Variant extends TtGetStarted.SetUpClientVariant>(
  variant: Omit<Variant, "kind">,
): Variant {
  return { ...variant, kind: "set-up-client" } as Variant;
}

function setUpMcpVar<Variant extends TtGetStarted.SetUpMcpVariant>(
  variant: Omit<Variant, "kind">,
): Variant {
  return { ...variant, kind: "set-up-mcp" } as Variant;
}

function testExampleVar<Variant extends TtGetStarted.TestExampleVariant>(
  variant: Omit<Variant, "kind">,
): Variant {
  return { ...variant, kind: "test-client-example" } as Variant;
}
