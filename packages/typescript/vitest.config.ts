import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vitest/config";
import { Driver } from "./src/drivers/Driver.ts";
import { Env } from "./src/Env.ts";
import { Logger } from "./src/telemetry/Logger.ts";
import PassThresholdReporter from "./tests/utils/PassThresholdReporter.ts";
import type { InlineConfig } from "vitest/node";

const driverKind = Env.ALUMNIUM_DRIVER;
const isAppium = Driver.isAppium(driverKind);

await Logger.initEnv();

const reporters: InlineConfig["reporters"] & {} = ["default"];
if (Env.ALUMNIUM_TEST_PASS_THRESHOLD_PCT < 100)
  reporters.push(
    new PassThresholdReporter(Env.ALUMNIUM_TEST_PASS_THRESHOLD_PCT),
  );

export default defineConfig({
  test: {
    reporters,

    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          setupFiles: ["tests/unit/setup.ts"],
          server: {
            deps: {
              // Process the package with vitest so vi.mock("@cursor/sdk")
              // reaches the dynamic import inside it.
              inline: ["langchain-cursor"],
            },
          },
          pool: "threads",
          maxWorkers: Env.ALUMNIUM_TEST_MAX_CONCURRENCY,
        },
      },

      {
        test: {
          name: "system",
          include: ["tests/system/**/*.test.ts"],
          testTimeout: 5 * 60_000, // 5 minutes
          retry: {
            count: Env.ALUMNIUM_TEST_RETRY_COUNT,
            delay: Env.ALUMNIUM_TEST_RETRY_DELAY,
          },
          globalSetup: isAppium ? ["tests/system/setup.appium.ts"] : [],
          setupFiles: ["tests/system/setup.ts"],
          pool: "threads",
          fileParallelism: !isAppium,
          maxWorkers: Env.ALUMNIUM_TEST_MAX_CONCURRENCY,
        },
      },
    ],

    tags: [
      {
        name: "external",
        description:
          "Unstable tests that rely on external services and may fail just because of that.",
        skip: true,
      },
    ],
  },
  plugins: [
    // TODO: Get rid of it when this is closed and shipped with Vite:
    // https://github.com/oxc-project/oxc/issues/9170
    babel({
      presets: [
        {
          preset: () => ({
            plugins: [
              ["@babel/plugin-proposal-decorators", { version: "2023-11" }],
            ],
          }),
          rolldown: { filter: { code: "@" } },
        },
      ],
    }),
  ],
});
