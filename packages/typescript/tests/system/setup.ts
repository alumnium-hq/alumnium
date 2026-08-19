import { beforeEach, afterAll } from "vitest";
import { Tracer } from "../../src/telemetry/Tracer.ts";
import { Logger } from "../../src/telemetry/Logger.ts";

const logger = Logger.get(import.meta.url);

beforeEach(({ task }) => {
  const {
    name,
    file: { name: file },
  } = task;
  logger.debug("Starting test {name} ({file})", { file, name });
});

// Make sure to flush the telemetry data after all tests are done.
afterAll(() => {
  return Tracer.flush();
});
