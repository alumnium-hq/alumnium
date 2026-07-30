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

  describe("external tool inputs", () => {
    const SESSION_ID = "854ea339-1941-4b1a-bdef-c48ea8da41ac";

    it("masks a value quoted inside a shell command", () => {
      const masker = recordingMasker(`{"session_id": "${SESSION_ID}"}`);

      expect(
        masker.maskExternalToolInput({
          command: `foo --session_id "${SESSION_ID}"`,
        }),
      ).toEqual({ command: 'foo --session_id "<EXTERNAL_0_session_id>"' });
    });

    it("masks a value in single quotes", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(
        masker.maskExternalToolInput({ command: "foo --to 'foo@bar.com'" }),
      ).toEqual({ command: "foo --to '<EXTERNAL_0_email>'" });
    });

    it("masks a value quoted inside a JSON string in single quotes", () => {
      const masker = recordingMasker('{"id": "a1"}');

      expect(
        masker.maskExternalToolInput({ command: `curl -d '{"id": "a1"}'` }),
      ).toEqual({ command: `curl -d '{"id": "<EXTERNAL_0_id>"}'` });
    });

    it("masks every occurrence of the same value", () => {
      const masker = recordingMasker('{"id": "a1"}');

      expect(
        masker.maskExternalToolInput({ command: 'foo "a1" && bar "a1"' }),
      ).toEqual({
        command: 'foo "<EXTERNAL_0_id>" && bar "<EXTERNAL_0_id>"',
      });
    });

    it("masks a whole input value", () => {
      const masker = recordingMasker('{"path": "/tmp/report.txt"}');

      expect(
        masker.maskExternalToolInput({ file_path: "/tmp/report.txt" }),
      ).toEqual({ file_path: "<EXTERNAL_0_path>" });
    });

    it("masks a value that is both a whole value and quoted", () => {
      const masker = recordingMasker(`{"session_id": "${SESSION_ID}"}`);

      expect(
        masker.maskExternalToolInput({
          session_id: SESSION_ID,
          command: `foo "${SESSION_ID}"`,
        }),
      ).toEqual({
        session_id: "<EXTERNAL_0_session_id>",
        command: 'foo "<EXTERNAL_0_session_id>"',
      });
    });

    it("masks a value between escaped double quotes", () => {
      const masker = recordingMasker(`{"session_id": "${SESSION_ID}"}`);

      expect(
        masker.maskExternalToolInput({
          command: `curl -d "{\\"session_id\\": \\"${SESSION_ID}\\"}"`,
        }),
      ).toEqual({
        command: `curl -d "{\\"session_id\\": \\"<EXTERNAL_0_session_id>\\"}"`,
      });
    });

    it("masks a value between doubly escaped quotes", () => {
      const masker = recordingMasker('{"id": "a1"}');

      expect(
        masker.maskExternalToolInput({ command: `foo \\\\"a1\\\\"` }),
      ).toEqual({ command: `foo \\\\"<EXTERNAL_0_id>\\\\"` });
    });

    it("leaves a value whose delimiters escape differently alone", () => {
      // NOTE: `"a1\"` is not a quoted token - the opening quote is bare and the
      // closing one is escaped, so they belong to two different runs.
      const masker = recordingMasker('{"id": "a1"}');

      expect(masker.maskExternalToolInput({ command: `foo "a1\\"` })).toEqual({
        command: `foo "a1\\"`,
      });
    });

    it("leaves an unquoted value alone", () => {
      const masker = recordingMasker(`{"session_id": "${SESSION_ID}"}`);

      expect(
        masker.maskExternalToolInput({
          command: `foo --session_id ${SESSION_ID}`,
        }),
      ).toEqual({ command: `foo --session_id ${SESSION_ID}` });
    });

    it("leaves a longer token containing the value alone", () => {
      const masker = recordingMasker('{"num": 9}');

      expect(
        masker.maskExternalToolInput({ command: 'foo --retries "19"' }),
      ).toEqual({ command: 'foo --retries "19"' });
    });

    it("leaves a value quoted in a description alone", () => {
      const masker = recordingMasker('{"id": "a1"}');

      expect(
        masker.maskExternalToolInput({
          command: 'foo "a1"',
          description: 'Run foo with "a1"',
        }),
      ).toEqual({
        command: 'foo "<EXTERNAL_0_id>"',
        description: 'Run foo with "a1"',
      });
    });

    it("masks values in a Write content nesting escaped JSON", () => {
      // The shape a hook payload takes: a JSON document whose `text` field is
      // itself a JSON string, so its quotes reach `content` escaped.
      const masker = recordingMasker(
        '{"guest": {"aaj": "37|2|DEF", "aat": "0|+fF2"}}',
      );
      const inner = String.raw`{\"guest\":{\"aaj\":\"37|2|DEF\",\"aat\":\"0|+fF2\"}}`;

      expect(
        masker.maskExternalToolInput({
          file_path: "/tmp/login-input.json",
          content: `{"tool_response":{"text":"${inner}"}}`,
        }),
      ).toEqual({
        file_path: "/tmp/login-input.json",
        content: `{"tool_response":{"text":"${String.raw`{\"guest\":{\"aaj\":\"<EXTERNAL_0_guest_aaj>\",\"aat\":\"<EXTERNAL_0_guest_aat>\"}}`}"}}`,
      });
    });

    it("does not mask a quoted value in an MCP tool input", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(
        masker.maskInput({ goal: "type 'foo@bar.com' to username" }),
      ).toEqual({ goal: "type 'foo@bar.com' to username" });
    });
  });

  describe("masksToolInput", () => {
    it("masks tools playback executes", () => {
      expect(ScenarioMasker.masksToolInput("Bash")).toBe(true);
      expect(ScenarioMasker.masksToolInput("Read")).toBe(true);
      expect(ScenarioMasker.masksToolInput("mcp__server__create_guest")).toBe(
        true,
      );
    });

    it("masks tools playback cannot execute, to keep values out of the scenario", () => {
      expect(ScenarioMasker.masksToolInput("Write")).toBe(true);
      expect(ScenarioMasker.masksToolInput("Edit")).toBe(true);
    });

    it("leaves a prose-only tool input verbatim", () => {
      expect(ScenarioMasker.masksToolInput("TodoWrite")).toBe(false);
    });
  });

  describe("unmasking external tool inputs", () => {
    it("substitutes a freshly produced value inside a command", () => {
      const recorded = recordingMasker(
        '{"session_id": "854e"}',
      ).maskExternalToolInput({ command: 'foo --session_id "854e"' });

      const replayMasker = recordingMasker('{"session_id": "0f1e"}');

      expect(replayMasker.unmaskExternalToolInput(recorded)).toEqual({
        command: 'foo --session_id "0f1e"',
      });
    });

    it("keeps the quote the command used", () => {
      const recorded = recordingMasker(
        '{"email": "a@b.com"}',
      ).maskExternalToolInput({ command: "foo --to 'a@b.com'" });

      const replayMasker = recordingMasker('{"email": "c@d.com"}');

      expect(replayMasker.unmaskExternalToolInput(recorded)).toEqual({
        command: "foo --to 'c@d.com'",
      });
    });

    it("substitutes every occurrence", () => {
      const recorded = recordingMasker('{"id": "a1"}').maskExternalToolInput({
        command: 'foo "a1" && bar "a1"',
      });

      const replayMasker = recordingMasker('{"id": "b2"}');

      expect(replayMasker.unmaskExternalToolInput(recorded)).toEqual({
        command: 'foo "b2" && bar "b2"',
      });
    });

    it("leaves a quoted mask in place when the fresh output lacks its path", () => {
      const recorded = recordingMasker('{"id": "a1"}').maskExternalToolInput({
        command: 'foo "a1"',
      });

      const replayMasker = recordingMasker('{"other": "b2"}');

      expect(replayMasker.unmaskExternalToolInput(recorded)).toEqual({
        command: 'foo "<EXTERNAL_0_id>"',
      });
    });

    it("leaves a quoted mask in place when the fresh value contains the quote", () => {
      const recorded = recordingMasker(
        '{"name": "alex"}',
      ).maskExternalToolInput({ command: 'foo --name "alex"' });

      const replayMasker = recordingMasker('{"name": "al\\"ex"}');

      expect(replayMasker.unmaskExternalToolInput(recorded)).toEqual({
        command: 'foo --name "<EXTERNAL_0_name>"',
      });
    });

    it("leaves a double-quoted mask in place when the fresh value has a backslash", () => {
      const recorded = recordingMasker('{"path": "a/b"}').maskExternalToolInput(
        {
          command: 'foo --path "a/b"',
        },
      );

      const replayMasker = recordingMasker('{"path": "a\\\\b"}');

      expect(replayMasker.unmaskExternalToolInput(recorded)).toEqual({
        command: 'foo --path "<EXTERNAL_0_path>"',
      });
    });

    it("substitutes a single-quoted value containing a double quote", () => {
      const recorded = recordingMasker(
        '{"name": "alex"}',
      ).maskExternalToolInput({ command: "foo --name 'alex'" });

      const replayMasker = recordingMasker('{"name": "al\\"ex"}');

      expect(replayMasker.unmaskExternalToolInput(recorded)).toEqual({
        command: `foo --name 'al"ex'`,
      });
    });

    it("substitutes a value between escaped double quotes", () => {
      const recorded = recordingMasker(
        '{"session_id": "854e"}',
      ).maskExternalToolInput({
        command: `curl -d "{\\"session_id\\": \\"854e\\"}"`,
      });

      const replayMasker = recordingMasker('{"session_id": "0f1e"}');

      expect(replayMasker.unmaskExternalToolInput(recorded)).toEqual({
        command: `curl -d "{\\"session_id\\": \\"0f1e\\"}"`,
      });
    });

    it("leaves an escaped-quote mask in place when the fresh value has a quote", () => {
      const recorded = recordingMasker(
        '{"name": "alex"}',
      ).maskExternalToolInput({ command: `foo "{\\"name\\": \\"alex\\"}"` });

      const replayMasker = recordingMasker('{"name": "al\\"ex"}');

      expect(replayMasker.unmaskExternalToolInput(recorded)).toEqual({
        command: `foo "{\\"name\\": \\"<EXTERNAL_0_name>\\"}"`,
      });
    });

    it("leaves an escaped single-quote mask in place when the value has a backslash", () => {
      // NOTE: Unlike a bare `'`, an escaped one implies a layer that still
      // gives a backslash meaning.
      const recorded = recordingMasker('{"path": "a/b"}').maskExternalToolInput(
        {
          command: `foo \\'a/b\\'`,
        },
      );

      const replayMasker = recordingMasker('{"path": "a\\\\b"}');

      expect(replayMasker.unmaskExternalToolInput(recorded)).toEqual({
        command: `foo \\'<EXTERNAL_0_path>\\'`,
      });
    });

    it("does not substitute a quoted mask in an MCP tool input", () => {
      const replayMasker = recordingMasker('{"num1": 7}');

      expect(
        replayMasker.unmaskInput({
          goal: "press the '<EXTERNAL_0_num1>' button",
        }),
      ).toEqual({ goal: "press the '<EXTERNAL_0_num1>' button" });
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
