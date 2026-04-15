import { afterEach } from "vitest";
import { Logger } from "../../src/telemetry/Logger.ts";
import { clearAllMocks } from "./mocks.ts";

Logger.level = "error";

afterEach(clearAllMocks);
