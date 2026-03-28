import { afterEach } from "bun:test";
import { setLoggerLevel } from "../src/utils/logger.js";
import { clearAllMocks as cleanAllMocks } from "./mocks.js";

setLoggerLevel("error");

afterEach(cleanAllMocks);
