import { describe, expect, it } from "vitest";
import type { Scenario } from "./Scenario.ts";
import type { ScenarioPlayer } from "./ScenarioPlayer.ts";
import { ScenarioRecovery } from "./ScenarioRecovery.ts";

function textContent(text: string) {
  return [{ type: "text" as const, text }];
}

function mcpStep(
  name: string,
  input: Record<string, unknown>,
  output: string,
): Scenario.ClaudeCodeMcpStep {
  return {
    kind: "tool-use",
    use: { type: "tool_use", id: `use-${name}`, name, input },
    result: {
      type: "tool_result",
      tool_use_id: `use-${name}`,
      content: textContent(output),
    },
  };
}

function externalStep(
  name: string,
  input: Record<string, unknown>,
): Scenario.ClaudeCodeStep {
  return {
    kind: "external-tool-use",
    use: { type: "tool_use", id: `use-${name}`, name, input },
    result: {
      type: "tool_result",
      tool_use_id: `use-${name}`,
      content: textContent("{}"),
    },
  };
}

function narrationStep(text: string): Scenario.ClaudeCodeStep {
  return { kind: "narration", narration: "thinking", text };
}

function scenario(steps: Scenario.ClaudeCodeStep[]): Scenario.Type {
  return {
    agent: "claude-code",
    id: "scenario-id" as Scenario.Id,
    text: "# Calculator: Addition",
    path: "scenarios/calculator/01-addition.md",
    steps,
  };
}

function log(
  step: Scenario.ClaudeCodeMcpStep,
  output: string,
  error?: string,
): ScenarioPlayer.Log {
  return {
    step,
    mcpOutput: { content: textContent(output) },
    ...(error ? { error } : {}),
  };
}

const CHECK_STEP = mcpStep(
  "mcp__alumnium__check",
  { id: "driver-1", statement: "the calculator display show 5" },
  JSON.stringify({ result: "success", explanation: "The display shows 5." }),
);

const DO_STEP = mcpStep(
  "mcp__alumnium__do",
  { id: "driver-1", goal: "press {digit} button", params: { digit: "2" } },
  JSON.stringify({ explanation: "Pressed 2." }),
);

describe("ScenarioRecovery", () => {
  describe("playbackSummary", () => {
    it("says why the playback stopped", () => {
      const summary = ScenarioRecovery.playbackSummary({
        scenario: scenario([DO_STEP, CHECK_STEP]),
        error: "MCP tool 'mcp__alumnium__check' output does not match!",
        logs: [],
      });

      expect(summary).toBe(
        "Why it stopped: MCP tool 'mcp__alumnium__check' output does not match!",
      );
    });

    it("shows what the failing step returned then and now", () => {
      const summary = ScenarioRecovery.playbackSummary({
        scenario: scenario([DO_STEP, CHECK_STEP]),
        error: "MCP tool 'mcp__alumnium__check' output does not match!",
        logs: [
          log(DO_STEP, JSON.stringify({ explanation: "Pressed 2." })),
          log(
            CHECK_STEP,
            JSON.stringify({
              result: "failure",
              explanation: "The display shows 4, not 5.",
            }),
            "MCP tool 'mcp__alumnium__check' output does not match!",
          ),
        ],
      });

      expect(summary).toContain(
        'The step it stopped on: check "the calculator display show 5"',
      );
      expect(summary).toContain('"result":"success"');
      expect(summary).toContain("The display shows 4, not 5.");
      expect(summary).toContain(
        "The steps the playback got through, in order:",
      );
      expect(summary).toContain('1. do "press {digit} button", {"digit":"2"}');
      expect(summary).toContain('2. check "the calculator display show 5"');
    });

    it("points at no step when the playback failed before making a call", () => {
      const summary = ScenarioRecovery.playbackSummary({
        scenario: scenario([DO_STEP]),
        error: "Scenario playback failed: Error: connection closed",
        logs: [log(DO_STEP, JSON.stringify({ explanation: "Pressed 2." }))],
      });

      expect(summary).not.toContain("The step it stopped on:");
      expect(summary).toContain("Why it stopped: Scenario playback failed:");
      expect(summary).toContain('1. do "press {digit} button"');
    });

    it("leaves out the steps beyond the last few", () => {
      const logs = Array.from(
        { length: ScenarioRecovery.MAX_PLAYED_STEPS + 3 },
        () => log(DO_STEP, "{}"),
      );

      const summary = ScenarioRecovery.playbackSummary({
        scenario: scenario([DO_STEP]),
        error: "boom",
        logs,
      });

      expect(summary).toContain("(3 earlier steps left out of this list)");
      expect(summary).not.toContain("\n1. ");
      expect(summary).toContain(`${logs.length}. do `);
    });
  });

  describe("recordedSteps", () => {
    it("lists the steps the way the console prints them", () => {
      expect(ScenarioRecovery.recordedSteps(scenario([DO_STEP, CHECK_STEP])))
        .toBe(`1. do "press {digit} button", {"digit":"2"}
2. check "the calculator display show 5"`);
    });

    it("leaves out narration", () => {
      const steps = ScenarioRecovery.recordedSteps(
        scenario([narrationStep("Let me press the buttons."), DO_STEP]),
      );

      expect(steps).toBe('1. do "press {digit} button", {"digit":"2"}');
    });

    it("lists an external call with its input as JSON", () => {
      const steps = ScenarioRecovery.recordedSteps(
        scenario([externalStep("Bash", { command: 'echo "{}"' })]),
      );

      expect(steps).toBe('1. Bash {"command":"echo \\"{}\\""}');
    });

    it("leaves out the agent's own plumbing, and the verdict with it", () => {
      const steps = ScenarioRecovery.recordedSteps(
        scenario([
          externalStep("ToolSearch", { query: "select:mcp__alumnium__do" }),
          DO_STEP,
          externalStep("StructuredOutput", {
            result: "success",
            details: "The check confirmed the display shows 4.",
          }),
        ]),
      );

      expect(steps).toBe('1. do "press {digit} button", {"digit":"2"}');
    });

    it("carries no tool output", () => {
      const steps = ScenarioRecovery.recordedSteps(scenario([CHECK_STEP]));

      expect(steps).not.toContain("The display shows 5.");
    });

    it("leaves out the steps beyond the first few", () => {
      const steps = Array.from(
        { length: ScenarioRecovery.MAX_RECORDED_STEPS + 2 },
        () => DO_STEP,
      );

      expect(ScenarioRecovery.recordedSteps(scenario(steps))).toContain(
        "(2 later steps left out of this list)",
      );
    });

    it("shortens a step that does not fit on a line", () => {
      const goal = "x".repeat(ScenarioRecovery.MAX_LINE_LENGTH * 2);
      const steps = ScenarioRecovery.recordedSteps(
        scenario([
          mcpStep("mcp__alumnium__do", { id: "driver-1", goal }, "{}"),
        ]),
      );

      expect(steps).toContain("...");
      expect(steps.length).toBeLessThan(goal.length);
    });
  });

  describe("prompt", () => {
    it("asks for the truth rather than for a pass", () => {
      const prompt = ScenarioRecovery.prompt({
        scenario: scenario([DO_STEP, CHECK_STEP]),
        error: "MCP tool 'mcp__alumnium__check' output does not match!",
        logs: [log(CHECK_STEP, "{}", "boom")],
      });

      expect(prompt).toContain("## Recovering a failed playback");
      expect(prompt).toContain("### How the playback failed");
      expect(prompt).toContain("### What the stale recording did");
      expect(prompt).toContain("report `failure`");
      expect(prompt).toContain("Start the scenario at its first step.");
    });

    it("keeps the step lists on their own lines", () => {
      const prompt = ScenarioRecovery.prompt({
        scenario: scenario([DO_STEP, CHECK_STEP]),
        error: "boom",
        logs: [],
      });

      expect(prompt).toContain(`1. do "press {digit} button", {"digit":"2"}
2. check "the calculator display show 5"`);
    });
  });
});
