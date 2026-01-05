import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./examples/playwright",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "html",
  timeout: 300000, // 5 minutes
  use: {
    trace: "on",
    video: "on",
  },
  projects: [
    {
      name: "default",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
