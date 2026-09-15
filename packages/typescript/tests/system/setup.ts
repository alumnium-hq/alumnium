import { afterAll, aroundEach } from "vitest";
import { Tracer } from "../../src/telemetry/Tracer.ts";
import { Logger } from "../../src/telemetry/Logger.ts";

const logger = Logger.get(import.meta.url);
const tracer = Tracer.get(import.meta.url);

aroundEach((runTest, { task }) => {
  const {
    id,
    name,
    file: { name: file },
  } = task;

  return tracer.span(
    "test.case",
    {
      "test.case.id": id,
      "test.case.name": task.fullTestName || name,
      "test.file.name": file,
      "test.retry.count": task.result?.retryCount || 0,
    },
    async (span) => {
      logger.debug("Starting test {name} ({file})", { file, name });
      await runTest();

      if (task.result?.state === "fail") {
        const error = task.result.errors?.[0]?.message || "Test failed";
        span.fail(error);
      }
    },
  );
});

// Make sure to flush the telemetry data after all tests are done.
afterAll(() => {
  return Tracer.flush();
});
