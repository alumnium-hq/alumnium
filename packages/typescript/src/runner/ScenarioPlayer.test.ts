import { describe, expect, it } from "vitest";
import { ScenarioPlayer } from "./ScenarioPlayer.ts";

function checkOutput(result: string, explanation: string) {
  return [
    { type: "text" as const, text: JSON.stringify({ result, explanation }) },
  ];
}

describe("ScenarioPlayer", () => {
  describe("matchOutput", () => {
    it("matches a check verdict regardless of its explanation", () => {
      expect(
        ScenarioPlayer.matchOutput(
          "check",
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

    it("does not match differing check verdicts", () => {
      expect(
        ScenarioPlayer.matchOutput(
          "check",
          checkOutput("success", "The display shows 11."),
          checkOutput("failure", "AssertionError: the display shows 74."),
        ),
      ).toBe(false);
    });

    it("reads the verdict out of a string content", () => {
      expect(
        ScenarioPlayer.matchOutput(
          "check",
          JSON.stringify({ result: "success", explanation: "recorded" }),
          checkOutput("success", "played back"),
        ),
      ).toBe(true);
    });

    it("compares a check output with no verdict in full", () => {
      expect(
        ScenarioPlayer.matchOutput(
          "check",
          [{ type: "text", text: "boom" }],
          [{ type: "text", text: "boom" }],
        ),
      ).toBe(true);
      expect(
        ScenarioPlayer.matchOutput(
          "check",
          [{ type: "text", text: "boom" }],
          [{ type: "text", text: "bang" }],
        ),
      ).toBe(false);
    });

    it("compares other tool outputs in full", () => {
      // NOTE: `get` returns the extracted data itself, so all of it matters.
      expect(
        ScenarioPlayer.matchOutput(
          "get",
          [{ type: "text", text: '"11"' }],
          [{ type: "text", text: '"11"' }],
        ),
      ).toBe(true);
      expect(
        ScenarioPlayer.matchOutput(
          "get",
          [{ type: "text", text: '"11"' }],
          [{ type: "text", text: '"74"' }],
        ),
      ).toBe(false);
    });
  });
});
