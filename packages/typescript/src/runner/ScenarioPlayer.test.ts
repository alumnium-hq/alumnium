import { describe, expect, it } from "vitest";
import { ScenarioPlayer } from "./ScenarioPlayer.ts";

function checkOutput(result: string, explanation: string) {
  return [
    { type: "text" as const, text: JSON.stringify({ result, explanation }) },
  ];
}

describe("ScenarioPlayer", () => {
  describe("matchCheckOutput", () => {
    it("matches a verdict regardless of its explanation", () => {
      expect(
        ScenarioPlayer.matchCheckOutput(
          checkOutput(
            "success",
            "The accessibility tree includes a heading saying 'Search'.",
          ),
          checkOutput(
            "success",
            'The accessibility tree contains a heading: "Search".',
          ),
        ),
      ).toBe(true);
    });

    it("does not match differing verdicts", () => {
      expect(
        ScenarioPlayer.matchCheckOutput(
          checkOutput("success", "The display shows 11."),
          checkOutput("failure", "AssertionError: the display shows 74."),
        ),
      ).toBe(false);
    });

    it("reads the verdict out of a string content", () => {
      expect(
        ScenarioPlayer.matchCheckOutput(
          JSON.stringify({ result: "success", explanation: "recorded" }),
          checkOutput("success", "played back"),
        ),
      ).toBe(true);
    });

    it("compares an output with no verdict in full", () => {
      expect(
        ScenarioPlayer.matchCheckOutput(
          [{ type: "text", text: "boom" }],
          [{ type: "text", text: "boom" }],
        ),
      ).toBe(true);
      expect(
        ScenarioPlayer.matchCheckOutput(
          [{ type: "text", text: "boom" }],
          [{ type: "text", text: "bang" }],
        ),
      ).toBe(false);
    });
  });

  describe("readOutputError", () => {
    it("reads a flagged error", () => {
      expect(
        ScenarioPlayer.readOutputError(
          [{ type: "text", text: "Error: no such element" }],
          true,
        ),
      ).toBe("Error: no such element");
    });

    it("reads an error a recording made before the flag only worded", () => {
      expect(
        ScenarioPlayer.readOutputError([
          { type: "text", text: "Error: no such element" },
        ]),
      ).toBe("Error: no such element");
    });

    it("reads a flagged error with nothing to say", () => {
      expect(ScenarioPlayer.readOutputError([], true)).toBe(
        "the tool call failed",
      );
    });

    it("reads no error out of a successful output", () => {
      expect(
        ScenarioPlayer.readOutputError(
          checkOutput("success", "The display shows 4."),
        ),
      ).toBe(null);
    });

    it("reads no error out of an output that only mentions one", () => {
      expect(
        ScenarioPlayer.readOutputError(
          checkOutput("failure", "AssertionError: Error: is not shown."),
        ),
      ).toBe(null);
    });
  });
});
