import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          setupFiles: ["tests/unit/setup.ts"],
        },
      },
      {
        test: {
          name: "system",
          include: ["tests/system/**/*.test.ts"],
          testTimeout: 5 * 60_000, // 5 minutes
          retry: {
            count: process.env.CI ? 1 : 0,
            delay: 1000,
          },
          globalSetup: process.env.ALUMNIUM_DRIVER?.startsWith("appium")
            ? ["tests/system/setup.appium.ts"]
            : [],
          fileParallelism: !process.env.ALUMNIUM_DRIVER?.startsWith("appium"),
        },
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
