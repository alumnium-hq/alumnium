import { describe, expect, it } from "vitest";
import type { Scenario } from "./Scenario.ts";
import { ScenarioMasker } from "./ScenarioMasker.ts";

function recordingMasker(
  output: Scenario.ClaudeCodeStepToolResultContent,
  callIndex = 0,
): ScenarioMasker {
  const masker = new ScenarioMasker();
  masker.registerExternalOutput(callIndex, output);
  return masker;
}

describe("ScenarioMasker", () => {
  describe("external values", () => {
    it("masks a params value that matches a JSON output value", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(
        masker.maskInput({
          goal: "type {email1} to username",
          params: { email1: "foo@bar.com" },
        }),
      ).toEqual({
        goal: "type {email1} to username",
        params: { email1: "<EXTERNAL_0_email>" },
      });
    });

    it("leaves a value quoted inside a goal alone", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(
        masker.maskInput({ goal: "type 'foo@bar.com' to username" }),
      ).toEqual({ goal: "type 'foo@bar.com' to username" });
    });

    it("masks a top-level value that matches in full", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(masker.maskInput({ goal: "foo@bar.com" })).toEqual({
        goal: "<EXTERNAL_0_email>",
      });
    });

    it("ignores output that is not JSON", () => {
      const masker = recordingMasker("4\n8");

      expect(masker.maskInput({ params: { a: "4", b: "8" } })).toEqual({
        params: { a: "4", b: "8" },
      });
    });

    it("ignores output that is a bare JSON scalar", () => {
      // NOTE: `JSON.parse` accepts `7`, but there is no key to name the value.
      const masker = recordingMasker("7");

      expect(masker.maskInput({ params: { number: "7" } })).toEqual({
        params: { number: "7" },
      });
    });

    it("masks values nested in objects and arrays", () => {
      const masker = recordingMasker(
        '{"items": [{"id": "a1"}, {"id": "b2"}], "user": {"name": "alex"}}',
      );

      expect(masker.maskInput({ params: { id: "b2", name: "alex" } })).toEqual({
        params: {
          id: "<EXTERNAL_0_items_1_id>",
          name: "<EXTERNAL_0_user_name>",
        },
      });
    });

    it("sanitizes non-alphanumeric path characters", () => {
      const masker = recordingMasker('{"user email": "foo@bar.com"}');

      expect(masker.maskInput({ params: { email: "foo@bar.com" } })).toEqual({
        params: { email: "<EXTERNAL_0_user_email>" },
      });
    });

    it("matches a JSON number against a string params value", () => {
      const masker = recordingMasker('{"num1": 7}');

      expect(masker.maskInput({ params: { num1: "7" } })).toEqual({
        params: { num1: "<EXTERNAL_0_num1>" },
      });
    });

    it("does not mask partial matches", () => {
      const masker = recordingMasker('{"num": 9}');

      expect(
        masker.maskInput({ params: { a: "19", b: "9 apples", c: "$9" } }),
      ).toEqual({ params: { a: "19", b: "9 apples", c: "$9" } });
    });

    it("skips empty, whitespace-only, boolean and null output values", () => {
      const masker = recordingMasker(
        '{"a": "", "b": "  ", "c": null, "d": true, "e": "x"}',
      );

      expect(
        masker.maskInput({ params: { p: "  ", q: "true", r: "x" } }),
      ).toEqual({
        params: { p: "  ", q: "true", r: "<EXTERNAL_0_e>" },
      });
    });

    it("leaves non-string input values alone", () => {
      const masker = recordingMasker('{"num": 4}');

      expect(
        masker.maskInput({ save_cache: true, count: 4, nested: { count: 4 } }),
      ).toEqual({ save_cache: true, count: 4, nested: { count: 4 } });
    });

    it("does not mask values derived by the agent", () => {
      const masker = recordingMasker('{"num1": 4, "num2": 8}');

      // 12 is 4 + 8 computed by the agent, so it is not in the output and
      // cannot be substituted on playback.
      expect(masker.maskInput({ params: { sum: "12" } })).toEqual({
        params: { sum: "12" },
      });
    });

    it("keeps values of separate external calls apart", () => {
      const masker = new ScenarioMasker();
      masker.registerExternalOutput(0, '{"a": 4}');
      masker.registerExternalOutput(1, '{"b": 8}');

      expect(masker.maskInput({ params: { x: "4", y: "8" } })).toEqual({
        params: { x: "<EXTERNAL_0_a>", y: "<EXTERNAL_1_b>" },
      });
    });

    it("keeps the first value of two paths sanitizing to the same mask", () => {
      const masker = recordingMasker('{"a_b": "first", "a": {"b": "second"}}');

      expect(masker.maskInput({ params: { x: "first", y: "second" } })).toEqual(
        { params: { x: "<EXTERNAL_0_a_b>", y: "second" } },
      );
    });

    it("reads JSON out of text result blocks", () => {
      const masker = recordingMasker([
        { type: "text", text: '{"email": "foo@bar.com"}' },
      ]);

      expect(masker.maskInput({ params: { email: "foo@bar.com" } })).toEqual({
        params: { email: "<EXTERNAL_0_email>" },
      });
    });

    it("normalizes surrounding whitespace", () => {
      // Recording sees the tool result, playback sees the raw stdout.
      const masker = recordingMasker('{"num1": 7}\n');

      expect(masker.maskInput({ params: { num1: "7" } })).toEqual({
        params: { num1: "<EXTERNAL_0_num1>" },
      });
    });
  });

  describe("unmasking external values", () => {
    it("substitutes freshly produced values on playback", () => {
      const recorded = recordingMasker('{"num1": 4}').maskInput({
        goal: "press the {num1} button",
        params: { num1: "4" },
      });

      // A fresh run of the same external tool produces a different value.
      const replayMasker = recordingMasker('{"num1": 7}');

      expect(replayMasker.unmaskInput(recorded)).toEqual({
        goal: "press the {num1} button",
        params: { num1: "7" },
      });
    });

    it("resolves by path rather than by position", () => {
      const recorded = recordingMasker('{"a": "1", "b": "2"}').maskInput({
        params: { x: "1" },
      });

      const replayMasker = recordingMasker('{"b": "9", "a": "8", "c": "7"}');

      expect(replayMasker.unmaskInput(recorded)).toEqual({
        params: { x: "8" },
      });
    });

    it("leaves a mask in place when the fresh output lacks its path", () => {
      const recorded = recordingMasker('{"a": "1"}').maskInput({
        params: { x: "1" },
      });

      const replayMasker = recordingMasker('{"b": "2"}');

      expect(replayMasker.unmaskInput(recorded)).toEqual({
        params: { x: "<EXTERNAL_0_a>" },
      });
    });
  });

  describe("driver id", () => {
    it("masks the driver id in the output and the inputs that follow", () => {
      const masker = new ScenarioMasker();

      expect(masker.maskOutputContent('{"id": "typescript-1785192884"}')).toBe(
        '{"id":"<MASKED_0>"}',
      );
      expect(
        masker.maskInput({ id: "typescript-1785192884", goal: "press 4" }),
      ).toEqual({ id: "<MASKED_0>", goal: "press 4" });
    });

    it("substitutes a freshly started driver id on playback", () => {
      const masker = new ScenarioMasker();
      masker.processMcpStartOutputContent([
        { type: "text", text: '{"id": "typescript-1785192999"}' },
      ]);

      expect(masker.unmaskInput({ id: "<MASKED_0>", goal: "press 4" })).toEqual(
        {
          id: "typescript-1785192999",
          goal: "press 4",
        },
      );
    });
  });

  describe("findUnresolvedExternalMasks", () => {
    it("finds masks nested in params", () => {
      expect(
        ScenarioMasker.findUnresolvedExternalMasks({
          goal: "type {email} to username",
          params: { email: "<EXTERNAL_0_email>" },
        }),
      ).toEqual(["<EXTERNAL_0_email>"]);
    });

    it("finds masks nested in arrays", () => {
      expect(
        ScenarioMasker.findUnresolvedExternalMasks({
          values: ["<EXTERNAL_0_a>", { nested: "<EXTERNAL_1_b>" }],
        }),
      ).toEqual(["<EXTERNAL_0_a>", "<EXTERNAL_1_b>"]);
    });

    it("finds a mask of a deeply nested path", () => {
      expect(
        ScenarioMasker.findUnresolvedExternalMasks({
          params: { id: "<EXTERNAL_10_items_2_id>" },
        }),
      ).toEqual(["<EXTERNAL_10_items_2_id>"]);
    });

    it("ignores a mask that does not take up a whole value", () => {
      // NOTE: Masking only ever replaces a whole value, so this is prose that
      // happens to look like a mask rather than one left unresolved.
      expect(
        ScenarioMasker.findUnresolvedExternalMasks({
          goal: "press the <EXTERNAL_0_num1> button",
        }),
      ).toEqual([]);
    });

    it("resolves to nothing when everything was substituted", () => {
      expect(
        ScenarioMasker.findUnresolvedExternalMasks({
          goal: "press the {num1} button",
          params: { num1: "7" },
        }),
      ).toEqual([]);
    });

    it("does not report driver id masks", () => {
      expect(
        ScenarioMasker.findUnresolvedExternalMasks({ id: "<MASKED_0>" }),
      ).toEqual([]);
    });
  });
});
