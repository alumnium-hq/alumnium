import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vitest/config";
// NOTE: Config loaders externalize workspace packages and Node can't load
// their TypeScript sources, so import the modules by path.
import { Driver } from "./core/src/drivers/Driver.ts";
import { Env } from "./core/src/Env.ts";
import { Logger } from "./core/src/telemetry/Logger.ts";
import PassThresholdReporter from "./alumnium/tests/utils/PassThresholdReporter.ts";
import type { InlineConfig } from "vitest/node";

const driverKind = Env.ALUMNIUM_DRIVER;
const isAppium = Driver.isAppium(driverKind);
const isMaestro = Driver.isMaestro(driverKind);
const isMobile = Driver.isMobile(driverKind);

await Logger.initEnv({ quiet: true });

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
          include: ["*/src/**/*.test.ts"],
          setupFiles: ["alumnium/tests/unit/setup.ts"],
          pool: "threads",
          maxWorkers: Env.ALUMNIUM_TEST_MAX_CONCURRENCY,
        },
      },

      {
        test: {
          name: "system",
          include: ["alumnium/tests/system/**/*.test.ts"],
          testTimeout: 5 * 60_000, // 5 minutes
          retry: {
            count: Env.ALUMNIUM_TEST_RETRY_COUNT,
            delay: Env.ALUMNIUM_TEST_RETRY_DELAY,
          },
          globalSetup: isAppium
            ? ["alumnium/tests/system/setup.appium.ts"]
            : isMaestro
              ? ["alumnium/tests/system/setup.maestro.ts"]
              : driverKind === "xcode"
                ? ["alumnium/tests/system/setup.xcode.ts"]
                : [],
          setupFiles: ["alumnium/tests/system/setup.ts"],
          pool: "threads",
          fileParallelism: !isMobile,
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
