import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScenarioReporter } from "./ScenarioReporter.ts";

describe(ScenarioReporter, () => {
  let print: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    print = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("stepCache", () => {
    it("reports a full hit", () => {
      ScenarioReporter.stepCache({ hits: 2, misses: 0 });

      expect(printedLine()).toContain("cache: yes (2/2)");
    });

    it("reports a full miss", () => {
      ScenarioReporter.stepCache({ hits: 0, misses: 1 });

      expect(printedLine()).toContain("cache: no (0/1)");
    });

    it("reports a partial hit", () => {
      ScenarioReporter.stepCache({ hits: 1, misses: 1 });

      expect(printedLine()).toContain("cache: partial (1/2)");
    });

    it("prints nothing when there were no lookups", () => {
      ScenarioReporter.stepCache({ hits: 0, misses: 0 });

      expect(print).not.toBeCalled();
    });
  });

  describe("cacheTotal", () => {
    it("reports the hit rate", () => {
      ScenarioReporter.cacheTotal({ hits: 9, misses: 1 });

      expect(printedLine()).toContain("● cache hit 90% (9/10)");
    });

    it("rounds the hit rate", () => {
      ScenarioReporter.cacheTotal({ hits: 1, misses: 2 });

      expect(printedLine()).toContain("● cache hit 33% (1/3)");
    });

    it("prints nothing when there were no lookups", () => {
      ScenarioReporter.cacheTotal({ hits: 0, misses: 0 });

      expect(print).not.toBeCalled();
    });
  });

  /**
   * NOTE: `FORCE_COLOR` is set for tests, so the printed line contains ANSI
   * escapes around every part of it.
   */
  function printedLine(): string {
    expect(print).toBeCalledTimes(1);
    const [line] = print.mock.calls[0] as [string];
    // oxlint-disable-next-line no-control-regex
    return line.replace(/\[\d+m/g, "");
  }
});
