import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "system",
          include: ["tests/system/**/*.test.ts"],
          testTimeout: 5 * 60_000, // 5 minutes
          retry: process.env.CI ? 1 : 0,
          sequence: { groupOrder: 0 },
        },
      },
    ],
    sequence: { concurrent: true },
  },
});
