import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScenarioReporter } from "./ScenarioReporter.ts";

describe(ScenarioReporter, () => {
  let print: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    print = vi.spyOn(console, "log").mockImplementation(() => {});
    // NOTE: The todo grouping remembers what it already reported, and reporting
    // the phase a run starts in is what resets it.
    ScenarioReporter.playing("scenario.md", "recording.json");
    print.mockClear();
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
    it("breaks a do output into reasoning, steps and changes", () => {
      ScenarioReporter.toolResult("mcp__alumnium__do", [
        {
          type: "text",
          text: JSON.stringify({
            explanation: "**Selecting location**\n\nI need to select Paris.",
            performed_steps: [
              {
                name: "select Paris from the location suggestions",
                tools: ["ClickTool(id='115')"],
              },
            ],
            changes: "URL did not change.",
          }),
        },
      ]);

      expect(printedLines()).toEqual([
        "  ✻ **Selecting location** I need to select Paris.",
        "  ◈ select Paris from the location suggestions (ClickTool(id='115'))",
        "  ± URL did not change.",
      ]);
    });

    it("prints a do step with no tools and no changes", () => {
      ScenarioReporter.toolResult("do", [
        {
          type: "text",
          text: JSON.stringify({
            performed_steps: [{ name: "press the plus button" }],
          }),
        },
      ]);

      expect(printedLine()).toBe("  ◈ press the plus button");
    });

    it("reduces a passing check to its verdict", () => {
      ScenarioReporter.toolResult("check", [
        {
          type: "text",
          text: JSON.stringify({
            result: "success",
            explanation: "The ARIA tree shows a dialog element.",
          }),
        },
      ]);

      expect(printedLine()).toBe("✓ The ARIA tree shows a dialog element.");
    });

    it("marks a failing check", () => {
      ScenarioReporter.toolResult("check", [
        {
          type: "text",
          text: JSON.stringify({
            result: "failure",
            explanation: "AssertionError: the display shows 4.",
          }),
        },
      ]);

      expect(printedLine()).toBe("✗ AssertionError: the display shows 4.");
    });

    it("prints every text block of an output it does not know", () => {
      ScenarioReporter.toolResult("start", [
        { type: "text", text: '{"id":"typescript-1"}' },
        { type: "text", text: '{"cache":"hit"}' },
      ]);

      expect(printedLines()).toEqual([
        '← {"id":"typescript-1"}',
        '← {"cache":"hit"}',
      ]);
    });

    it("falls back to the raw output when it cannot be broken down", () => {
      ScenarioReporter.toolResult("do", '{\n  "boom": "not a do output"\n}');

      expect(printedLine()).toBe('← { "boom": "not a do output" }');
    });

    it("prints the output of an external tool", () => {
      ScenarioReporter.toolResult("Bash", '{"num1": 7}\n');

      expect(printedLine()).toBe('← {"num1": 7}');
    });

    it("does not print the output of the agent's own bookkeeping", () => {
      ScenarioReporter.toolResult("ToolSearch", "<functions>...</functions>");
      ScenarioReporter.toolResult("TodoWrite", "Todos have been modified");

      expect(print).not.toBeCalled();
    });

    it("prints nothing when there is no output", () => {
      ScenarioReporter.toolResult("do", undefined);
      ScenarioReporter.toolResult("check", []);
      ScenarioReporter.toolResult("get", [{ type: "image", data: "..." }]);
      ScenarioReporter.toolResult("get", "   ");

      expect(print).not.toBeCalled();
    });
  });

  describe("todos", () => {
    function todo(content: string, status: string) {
      return { content, status, activeForm: `${content}ing` };
    }

    it("opens a group when a task is started", () => {
      ScenarioReporter.todos({
        todos: [
          todo("Perform 2+2=", "in_progress"),
          todo("Check 4", "pending"),
        ],
      });
      ScenarioReporter.todos({
        todos: [todo("Perform 2+2=", "completed"), todo("Check 4", "pending")],
      });

      // The group stays open until the next one starts, so finishing the task
      // prints nothing.
      expect(printedLines()).toEqual(["", "Perform 2+2="]);
    });

    it("prints nothing for a resent list that did not change", () => {
      const todos = { todos: [todo("Perform 2+2=", "in_progress")] };

      ScenarioReporter.todos(todos);
      print.mockClear();
      ScenarioReporter.todos(todos);

      expect(print).not.toBeCalled();
    });

    it("prints nothing for a task that is not started", () => {
      ScenarioReporter.todos({ todos: [todo("Check 4", "pending")] });
      ScenarioReporter.todos({ todos: [todo("Stop browser", "completed")] });

      expect(print).not.toBeCalled();
    });

    it("ignores an input it cannot read", () => {
      ScenarioReporter.todos({ boom: true });

      expect(print).not.toBeCalled();
    });

    it("starts over on a new run", () => {
      const todos = { todos: [todo("Perform 2+2=", "in_progress")] };

      ScenarioReporter.todos(todos);
      ScenarioReporter.playing("scenario.md", "abc.json");
      print.mockClear();
      ScenarioReporter.todos(todos);

      expect(printedLines()).toEqual(["", "Perform 2+2="]);
    });
  });

  describe("toolUse", () => {
    it("does not print a ToolSearch call", () => {
      ScenarioReporter.toolUse("ToolSearch", { query: "select:do" });

      expect(print).not.toBeCalled();
    });

    it("groups a TodoWrite call instead of printing it", () => {
      ScenarioReporter.toolUse("TodoWrite", {
        todos: [
          { content: "Perform 2+2=", status: "in_progress", activeForm: "…" },
        ],
      });

      expect(printedLines()).toEqual(["", "Perform 2+2="]);
    });

    it("prints other external tool calls", () => {
      ScenarioReporter.toolUse("Bash", { command: "echo 1" });

      expect(printedLine()).toBe('→ Bash {"command":"echo 1"}');
    });
  });

  describe("externalStep", () => {
    it("does not print a ToolSearch step", () => {
      ScenarioReporter.externalStep("ToolSearch", { query: "select:do" });
      ScenarioReporter.externalStepSkipped("ToolSearch", "no executor");

      expect(print).not.toBeCalled();
    });
  });

  describe("step", () => {
    it("does not shorten a long input", () => {
      const goal = `press the ${"very ".repeat(60)}long button`;

      ScenarioReporter.step("do", { id: "typescript-1", goal });

      expect(printedLine()).toBe(`→ do "${goal.trim()}"`);
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
