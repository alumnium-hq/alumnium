import { afterEach } from "vitest";
import { setLoggerLevel } from "../../src/utils/logger.ts";
import { clearAllMocks } from "./mocks.ts";

setLoggerLevel("error");

afterEach(clearAllMocks);
