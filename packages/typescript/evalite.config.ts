import { defineConfig } from "evalite/config";

export default defineConfig({
  testTimeout: 60000 * 5, // 5 minutes
  maxConcurrency: 10,
  scoreThreshold: 95,
});
