import { afterEach } from "vitest";
import { setLoggerLevel } from "../../src/utils/logger.js";
import { clearAllMocks } from "./mocks.js";

setLoggerLevel("error");

afterEach(clearAllMocks);
