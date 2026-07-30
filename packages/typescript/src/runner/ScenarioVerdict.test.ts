import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { ScenarioVerdict } from "./ScenarioVerdict.ts";

function successMessage(structuredOutput: unknown): SDKResultMessage {
  return {
    type: "result",
    subtype: "success",
    structured_output: structuredOutput,
    session_id: "session",
  } as SDKResultMessage;
}

function errorMessage(
  subtype: string,
  errors: string[] = [],
): SDKResultMessage {
  return {
    type: "result",
    subtype,
    errors,
    session_id: "session",
  } as unknown as SDKResultMessage;
}

describe("ScenarioVerdict", () => {
  describe("read", () => {
    it("reads a passing scenario with the reported details", () => {
      expect(
        ScenarioVerdict.read(
          successMessage({
            result: "success",
            details: "Performed 2+2= and the display showed 4.",
          }),
        ),
      ).toEqual({
        status: "success",
        details: "Performed 2+2= and the display showed 4.",
      });
    });

    it("reads a passing scenario reported without details", () => {
      expect(
        ScenarioVerdict.read(successMessage({ result: "success" })),
      ).toEqual({ status: "success", details: "" });
    });

    it("ignores a field the agent adds on top of the verdict", () => {
      expect(
        ScenarioVerdict.read(successMessage({ result: "success", steps: 7 })),
      ).toMatchObject({ status: "success" });
    });

    it("reads a failing scenario with the reported details", () => {
      expect(
        ScenarioVerdict.read(
          successMessage({
            result: "failure",
            details: "The display shows 4, expected 5.",
          }),
        ),
      ).toEqual({
        status: "failure",
        details: "The display shows 4, expected 5.",
      });
    });

    it("falls back to a reason when a failure is reported without details", () => {
      const verdict = ScenarioVerdict.read(
        successMessage({ result: "failure", details: "  " }),
      );

      expect(verdict.status).toBe("failure");
      expect(verdict.details).toBeTruthy();
    });

    // NOTE: The point of the strict `result` enum: a verdict that cannot be read
    // fails the run, rather than counting as a pass and saving the recording.
    it("does not treat an unknown verdict as a pass", () => {
      const verdict = ScenarioVerdict.read(
        successMessage({ result: "passed" }),
      );

      expect(verdict.status).toBe("failure");
      expect(verdict.details).toContain("unreadable");
    });

    it.each([undefined, "success", 42, null])(
      "fails on a %o structured output",
      (structuredOutput) => {
        expect(
          ScenarioVerdict.read(successMessage(structuredOutput)).status,
        ).toBe("failure");
      },
    );

    it.each([
      "error_during_execution",
      "error_max_turns",
      "error_max_budget_usd",
      "error_max_structured_output_retries",
    ])("fails on a %s result", (subtype) => {
      const verdict = ScenarioVerdict.read(errorMessage(subtype));

      expect(verdict.status).toBe("failure");
      expect(verdict.details).toContain(subtype);
    });

    it("includes the errors an errored run reports", () => {
      const verdict = ScenarioVerdict.read(
        errorMessage("error_during_execution", [
          "Connection reset",
          "Driver gone",
        ]),
      );

      expect(verdict.details).toContain("Connection reset; Driver gone");
    });
  });

  // NOTE: A cheap guard against the schema the agent is held to drifting away
  // from the one the verdict is read back with.
  describe("jsonSchema", () => {
    it("describes the verdict the agent has to report", () => {
      expect(ScenarioVerdict.jsonSchema()).toMatchObject({
        type: "object",
        properties: {
          result: { enum: ["success", "failure"] },
          details: { type: "string" },
        },
        required: ["result"],
        additionalProperties: false,
      });
    });

    // NOTE: Claude Code refuses a schema carrying `$schema` by offering no
    // `StructuredOutput` tool at all, which surfaces as a run that reports no
    // verdict rather than as an error - hence a test for one absent key.
    it("leaves out the key Claude Code refuses the schema over", () => {
      expect(ScenarioVerdict.jsonSchema()).not.toHaveProperty("$schema");
    });
  });

  describe("Text", () => {
    it("recognizes the verdict message", () => {
      expect(
        ScenarioVerdict.Text.safeParse(
          JSON.stringify({
            result: "failure",
            details: "The display shows 4.",
          }),
        ).success,
      ).toBe(true);
    });

    it("leaves the agent's prose alone", () => {
      expect(
        ScenarioVerdict.Text.safeParse(
          "The scenario failed: the display shows 4.",
        ).success,
      ).toBe(false);
    });
  });
});
