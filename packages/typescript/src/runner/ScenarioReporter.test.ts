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

  describe("toolResult", () => {
    it("prints every text block of the output", () => {
      ScenarioReporter.toolResult([
        { type: "text", text: '{"result":"success"}' },
        { type: "text", text: '{"cache":"hit"}' },
      ]);

      expect(printedLines()).toEqual([
        '  ← {"result":"success"}',
        '  ← {"cache":"hit"}',
      ]);
    });

    it("puts a multi-line output on a single line", () => {
      ScenarioReporter.toolResult('{\n  "explanation": "pressed 4"\n}');

      expect(printedLine()).toBe('  ← { "explanation": "pressed 4" }');
    });

    it("prints nothing when there is no output", () => {
      ScenarioReporter.toolResult(undefined);
      ScenarioReporter.toolResult([]);
      ScenarioReporter.toolResult([{ type: "image", data: "..." }]);
      ScenarioReporter.toolResult("   ");

      expect(print).not.toBeCalled();
    });
  });

  describe("step", () => {
    it("does not shorten a long input", () => {
      const goal = `press the ${"very ".repeat(60)}long button`;

      ScenarioReporter.step("1/2", "do", { id: "typescript-1", goal });

      expect(printedLine()).toBe(`  → 1/2 do "${goal.trim()}"`);
    });
  });

  /**
   * NOTE: `FORCE_COLOR` is set for tests, so the printed line contains ANSI
   * escapes around every part of it.
   */
  function printedLine(): string {
    expect(print).toBeCalledTimes(1);
    const [line] = printedLines();
    return line as string;
  }

  function printedLines(): string[] {
    return print.mock.calls.map(([line]: unknown[]) =>
      escapeless(String(line)),
    );
  }

  function escapeless(line: string): string {
    // oxlint-disable-next-line no-control-regex
    return line.replace(/\[\d+m/g, "");
  }
});
