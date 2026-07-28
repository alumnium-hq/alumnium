import { describe, expect, it } from "vitest";
import { ScenarioMasker } from "./ScenarioMasker.ts";

function recordingMasker(output: string, callIndex = 0): ScenarioMasker {
  const masker = new ScenarioMasker();
  masker.registerExternalOutput(callIndex, output);
  return masker;
}

describe("ScenarioMasker", () => {
  describe("external values", () => {
    it("masks values produced by an external tool", () => {
      const masker = recordingMasker("4\n8");

      expect(masker.maskInput({ goal: "Press the 4 button" })).toEqual({
        goal: "Press the <EXTERNAL_0_0> button",
      });
      expect(masker.maskInput({ goal: "Press the 8 button" })).toEqual({
        goal: "Press the <EXTERNAL_0_1> button",
      });
    });

    it("substitutes freshly produced values on playback", () => {
      const recorded = recordingMasker("4\n8").maskInput({
        goal: "Press the 4 button",
      });

      // A fresh run of the same external tool produces different values.
      const replayMasker = recordingMasker("7\n3");

      expect(replayMasker.unmaskInput(recorded)).toEqual({
        goal: "Press the 7 button",
      });
    });

    it("keeps values of separate external calls apart", () => {
      const masker = new ScenarioMasker();
      masker.registerExternalOutput(0, "4");
      masker.registerExternalOutput(1, "8");

      expect(masker.maskInput({ goal: "4 then 8" })).toEqual({
        goal: "<EXTERNAL_0_0> then <EXTERNAL_1_0>",
      });
    });

    it("only masks whole words", () => {
      const masker = recordingMasker("4");

      // The driver id and decimals must survive masking of the value "4".
      expect(
        masker.maskInput({ goal: "typescript-1785192884 shows 4.5 and 14" }),
      ).toEqual({ goal: "typescript-1785192884 shows 4.5 and 14" });
    });

    it("masks longer values before shorter ones", () => {
      const masker = recordingMasker("4\n48");

      expect(masker.maskInput({ goal: "48 and 4" })).toEqual({
        goal: "<EXTERNAL_0_1> and <EXTERNAL_0_0>",
      });
    });

    it("ignores prose words to avoid false positives", () => {
      const masker = recordingMasker("the quick brown fox");

      expect(masker.maskInput({ goal: "Press the quick button" })).toEqual({
        goal: "Press the quick button",
      });
    });

    it("masks long identifier-like values without digits", () => {
      const masker = recordingMasker("supercalifragilistic");

      expect(masker.maskInput({ goal: "Type supercalifragilistic" })).toEqual({
        goal: "Type <EXTERNAL_0_0>",
      });
    });

    it("does not mask values derived by the agent", () => {
      const masker = recordingMasker("4\n8");

      // 12 is 4 + 8 computed by the agent, so it is not in the output and
      // cannot be substituted on playback.
      expect(masker.maskInput({ statement: "display shows 12" })).toEqual({
        statement: "display shows 12",
      });
    });

    it("leaves non-string input values alone", () => {
      const masker = recordingMasker("4");

      expect(masker.maskInput({ save_cache: true, count: 4 })).toEqual({
        save_cache: true,
        count: 4,
      });
    });

    it("reads values out of text result blocks", () => {
      const masker = new ScenarioMasker();
      masker.registerExternalOutput(0, [{ type: "text", text: "4 8" }]);

      expect(masker.maskInput({ goal: "Press 4" })).toEqual({
        goal: "Press <EXTERNAL_0_0>",
      });
    });
  });

  describe("findUnresolvedExternalMasks", () => {
    it("finds masks left after unmasking", () => {
      expect(
        ScenarioMasker.findUnresolvedExternalMasks({
          goal: "Press <EXTERNAL_0_1> and <EXTERNAL_0_2>",
        }),
      ).toEqual(["<EXTERNAL_0_1>", "<EXTERNAL_0_2>"]);
    });

    it("resolves to nothing when everything was substituted", () => {
      expect(
        ScenarioMasker.findUnresolvedExternalMasks({ goal: "Press 7" }),
      ).toEqual([]);
    });
  });
});
