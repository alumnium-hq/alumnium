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

  // NOTE: What recording reads to decide whether to register an external call's
  // values, and playback to decide whether to execute the call at all.
  describe("isFailedToolResult", () => {
    it("reports a flagged result as failed", () => {
      expect(
        Scenario.isFailedToolResult({
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: "Error: the tool is unavailable",
          is_error: true,
        }),
      ).toBe(true);
    });

    it("reports an unflagged result as succeeded", () => {
      expect(
        Scenario.isFailedToolResult({
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: '{"item": {"id": "a1"}}',
        }),
      ).toBe(false);
    });

    // NOTE: An external tool reporting a failure in its own output is still a
    // call that ran, and playback has to replay it to produce its values again.
    it("reports a result whose output merely reads like an error as succeeded", () => {
      expect(
        Scenario.isFailedToolResult({
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: [
            { type: "text", text: '{"errorMessage": "the item is taken"}' },
          ],
          is_error: false,
        }),
      ).toBe(false);
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
