import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on',
  },

  projects: [
    {
      name: 'default',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
