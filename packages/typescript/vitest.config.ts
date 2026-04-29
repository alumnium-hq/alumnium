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
          retry: process.env.CI ? 3 : 0,
          globalSetup: process.env.ALUMNIUM_DRIVER?.startsWith("appium")
            ? ["tests/system/setup.appium.ts"]
            : [],
          fileParallelism: !process.env.ALUMNIUM_DRIVER?.startsWith("appium"),
        },
      },
    ],
    experimental: {
      // NOTE: Vite's module runner has issue with cyclic dependencies that
      // Node.js/Bun resolves just fine. It is subtle and result in modules
      // detected as cyclic resolve empty objects instead of the actual exports.
      // It is hard to track down and causes random failures not reproducible in
      // actual runtime. This option makes Vitest use Node.js's native
      // TypeScript/modules support.
      viteModuleRunner: false,
    },
  },
});
