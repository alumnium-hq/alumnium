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
          retry: process.env.CI ? 1 : 0,
        },
      },
    ],
  },
});
