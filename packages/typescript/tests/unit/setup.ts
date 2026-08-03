import { afterEach, beforeEach, vi } from "vitest";
import { Logger } from "../../src/telemetry/Logger.ts";
import { clearAllMocks } from "./mocks.ts";
import { SystemProcess } from "../../src/system/SystemProcess.ts";

Logger.level = "error";

beforeEach(() => {
  SystemProcess.initCleanup();
});

afterEach(async () => {
  vi.useRealTimers();
  await clearAllMocks();
  // Remove all process cleanup hooks
  SystemProcess.clearCleanup();
});
