import { describe, expect, it } from "vitest";
import { ScenarioPlayer } from "./ScenarioPlayer.ts";

function checkOutput(result: string, explanation: string) {
  return [
    { type: "text" as const, text: JSON.stringify({ result, explanation }) },
  ];
}

describe("ScenarioPlayer", () => {
  describe("compareCheckOutput", () => {
    it("agrees on a verdict regardless of its explanation", () => {
      expect(
        ScenarioPlayer.compareCheckOutput(
          checkOutput(
            "success",
            "The accessibility tree includes a heading saying 'Search'.",
          ),
          checkOutput(
            "success",
            'The accessibility tree contains a heading: "Search".',
          ),
        ),
      ).toBe("agreed");
    });

    it("agrees on a check the recording has failing that fails now too", () => {
      expect(
        ScenarioPlayer.compareCheckOutput(
          checkOutput("failure", "AssertionError: the display shows 74."),
          checkOutput("failure", "AssertionError: the display shows 12."),
        ),
      ).toBe("agreed");
    });

    it("disagrees when a recorded pass fails now", () => {
      expect(
        ScenarioPlayer.compareCheckOutput(
          checkOutput("success", "The display shows 11."),
          checkOutput("failure", "AssertionError: the display shows 74."),
        ),
      ).toBe("disagreed");
    });

    // NOTE: The one tolerated direction - a recording holds a check that failed
    // and it passes now, so the playback carries on rather than re-recording.
    it("reports a recorded failure that passes now as improved", () => {
      expect(
        ScenarioPlayer.compareCheckOutput(
          checkOutput("failure", "AssertionError: the user is not shown."),
          checkOutput("success", "The user test1@email.com is shown."),
        ),
      ).toBe("improved");
    });

    it("disagrees on a verdict neither side recognizes", () => {
      expect(
        ScenarioPlayer.compareCheckOutput(
          checkOutput("failure", "recorded"),
          checkOutput("inconclusive", "played back"),
        ),
      ).toBe("disagreed");
    });

    it("reads the verdict out of a string content", () => {
      expect(
        ScenarioPlayer.compareCheckOutput(
          JSON.stringify({ result: "success", explanation: "recorded" }),
          checkOutput("success", "played back"),
        ),
      ).toBe("agreed");
    });

    it("compares an output with no verdict in full", () => {
      expect(
        ScenarioPlayer.compareCheckOutput(
          [{ type: "text", text: "boom" }],
          [{ type: "text", text: "boom" }],
        ),
      ).toBe("agreed");
      expect(
        ScenarioPlayer.compareCheckOutput(
          [{ type: "text", text: "boom" }],
          [{ type: "text", text: "bang" }],
        ),
      ).toBe("disagreed");
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
