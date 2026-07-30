import { describe, expect, it } from "vitest";
import { Scenario } from "./Scenario.ts";

function scenario(steps: Scenario.ClaudeCodeStep[]): Scenario.Type {
  return {
    agent: "claude-code",
    id: Scenario.textToId("a scenario"),
    text: "a scenario",
    path: "scenario.md",
    steps,
  };
}

function toolStep(name: string): Scenario.ClaudeCodeStep {
  return {
    kind: "tool-use",
    use: { type: "tool_use", id: name, name, input: {} },
    result: { type: "tool_result", tool_use_id: name },
  };
}

function narrationStep(text: string): Scenario.ClaudeCodeStep {
  return { kind: "narration", narration: "thinking", text };
}

describe("Scenario", () => {
  describe("executableStepsCount", () => {
    it("counts what the agent did", () => {
      expect(
        Scenario.executableStepsCount(
          scenario([toolStep("start"), toolStep("check")]),
        ),
      ).toBe(2);
    });

    // NOTE: The count is what a run is reported with, so recording the agent's
    // prose must not inflate it.
    it("leaves out what the agent said", () => {
      expect(
        Scenario.executableStepsCount(
          scenario([
            narrationStep("I need to open the calculator."),
            toolStep("start"),
            narrationStep("Now I check the total."),
            toolStep("check"),
          ]),
        ),
      ).toBe(2);
    });

    it("counts nothing in an empty scenario", () => {
      expect(Scenario.executableStepsCount(scenario([]))).toBe(0);
    });
  });

  // NOTE: A recording made before narration and the verdict were stored has to
  // keep loading, since the store is not versioned.
  describe("Schema", () => {
    it("accepts a recording with narration and a verdict", () => {
      const parsed = Scenario.Schema.safeParse({
        ...scenario([narrationStep("Thinking."), toolStep("start")]),
        verdict: { status: "success", details: "It worked." },
      });

      expect(parsed.success).toBe(true);
    });

    it("accepts a recording that has neither", () => {
      const parsed = Scenario.Schema.safeParse(scenario([toolStep("start")]));

      expect(parsed.success).toBe(true);
    });
  });
});
