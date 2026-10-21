import { describe, expect, it } from "vitest";
import type { Recording } from "../Recording.ts";
import { ToolCallMasker } from "./ToolCallMasker.ts";

function recordingMasker(output: string, callId = "0"): ToolCallMasker {
  const masker = new ToolCallMasker();
  masker.registerOutput(callId, JSON.parse(output));
  return masker;
}

function mask(
  masker: ToolCallMasker,
  scope: ToolCallMasker.Scope,
  input: Recording.Input,
): Recording.Input {
  return masker.mask(structuredClone(input), scope);
}

function unmask(
  masker: ToolCallMasker,
  scope: ToolCallMasker.Scope,
  input: Recording.Input,
): Recording.Input {
  return masker.unmask(structuredClone(input), scope);
}

describe("ToolCallMasker", () => {
  describe("whole scope", () => {
    it("masks a params value that matches a JSON output value", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(
        mask(masker, "whole", {
          goal: "type {email1} to username",
          params: { email1: "foo@bar.com" },
        }),
      ).toEqual({
        goal: "type {email1} to username",
        params: { email1: "<tool-call.0.email>" },
      });
    });

    // The payoff of `params` on `check`. Inlined into the statement the
    // value is frozen into the recording and replays stale; as a discrete leaf
    // it is masked, so a replay re-verifies against a fresh one.
    it("masks a params value of a check, keeping the statement stable", () => {
      const masker = recordingMasker('{"user": {"email": "test1@email.com"}}');

      expect(
        mask(masker, "whole", {
          statement: "the user {email} is shown",
          params: { email: "test1@email.com" },
        }),
      ).toEqual({
        statement: "the user {email} is shown",
        params: { email: "<tool-call.0.user.email>" },
      });
    });

    it("leaves a value inlined in a statement alone", () => {
      const masker = recordingMasker('{"user": {"email": "test1@email.com"}}');

      expect(
        mask(masker, "whole", {
          statement: "the user test1@email.com is shown",
        }),
      ).toEqual({ statement: "the user test1@email.com is shown" });
    });

    it("masks a params value of a start capabilities path", () => {
      const masker = recordingMasker('{"session_id": "eca3fa90"}');

      expect(
        mask(masker, "whole", {
          capabilities: "/tmp/runs/{session_id}/artifacts/capabilities.json",
          params: { session_id: "eca3fa90" },
        }),
      ).toEqual({
        capabilities: "/tmp/runs/{session_id}/artifacts/capabilities.json",
        params: { session_id: "<tool-call.0.session_id>" },
      });
    });

    it("leaves a value quoted inside a goal alone", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(
        mask(masker, "whole", { goal: "type 'foo@bar.com' to username" }),
      ).toEqual({ goal: "type 'foo@bar.com' to username" });
    });

    it("masks a top-level value that matches in full", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(mask(masker, "whole", { goal: "foo@bar.com" })).toEqual({
        goal: "<tool-call.0.email>",
      });
    });

    it("masks values nested in objects and arrays", () => {
      const masker = recordingMasker(
        '{"items": [{"id": "a1"}, {"id": "b2"}], "user": {"name": "alex"}}',
      );

      expect(
        mask(masker, "whole", { params: { id: "b2", name: "alex" } }),
      ).toEqual({
        params: {
          id: "<tool-call.0.items.1.id>",
          name: "<tool-call.0.user.name>",
        },
      });
    });

    it("sanitizes non-alphanumeric path characters", () => {
      const masker = recordingMasker('{"user email": "foo@bar.com"}');

      expect(
        mask(masker, "whole", { params: { email: "foo@bar.com" } }),
      ).toEqual({
        params: { email: "<tool-call.0.user_email>" },
      });
    });

    it("matches a JSON number against a string params value", () => {
      const masker = recordingMasker('{"num1": 7}');

      expect(mask(masker, "whole", { params: { num1: "7" } })).toEqual({
        params: { num1: "<tool-call.0.num1>" },
      });
    });

    it("does not mask partial matches", () => {
      const masker = recordingMasker('{"num": 9}');

      expect(
        mask(masker, "whole", {
          params: { a: "19", b: "9 apples", c: "$9" },
        }),
      ).toEqual({ params: { a: "19", b: "9 apples", c: "$9" } });
    });

    it("skips empty, whitespace-only, boolean and null output values", () => {
      const masker = recordingMasker(
        '{"a": "", "b": "  ", "c": null, "d": true, "e": "x"}',
      );

      expect(
        mask(masker, "whole", { params: { p: "  ", q: "true", r: "x" } }),
      ).toEqual({
        params: { p: "  ", q: "true", r: "<tool-call.0.e>" },
      });
    });

    it("leaves non-string input values alone", () => {
      const masker = recordingMasker('{"num": 4}');

      expect(
        mask(masker, "whole", {
          save_cache: true,
          count: 4,
          nested: { count: 4 },
        }),
      ).toEqual({ save_cache: true, count: 4, nested: { count: 4 } });
    });

    it("does not mask values derived by the agent", () => {
      const masker = recordingMasker('{"num1": 4, "num2": 8}');

      // 12 is 4 + 8 computed by the agent, so it is not in the output and
      // cannot be substituted on playback.
      expect(mask(masker, "whole", { params: { sum: "12" } })).toEqual({
        params: { sum: "12" },
      });
    });

    it("keeps the first value of two paths sanitizing to the same mask", () => {
      const masker = recordingMasker('{"a b": "first", "a-b": "second"}');

      expect(
        mask(masker, "whole", { params: { x: "first", y: "second" } }),
      ).toEqual({ params: { x: "<tool-call.0.a_b>", y: "second" } });
    });

    it("resolves paths sanitizing to the same mask whatever their key order", () => {
      const recording = recordingMasker('{"a b": "first", "a-b": "second"}');
      const masked = mask(recording, "whole", { params: { x: "first" } });
      const replay = recordingMasker('{"a-b": "fresh 2", "a b": "fresh 1"}');

      expect(unmask(replay, "whole", masked)).toEqual({
        params: { x: "fresh 1" },
      });
    });

    it("keeps an underscore key apart from a nested path", () => {
      const masker = recordingMasker('{"a_b": "first", "a": {"b": "second"}}');

      expect(
        mask(masker, "whole", { params: { x: "first", y: "second" } }),
      ).toEqual({
        params: { x: "<tool-call.0.a_b>", y: "<tool-call.0.a.b>" },
      });
    });
  });

  describe("embedded scope", () => {
    const SESSION_ID = "854ea339-1941-4b1a-bdef-c48ea8da41ac";

    it("masks a value quoted inside a shell command", () => {
      const masker = recordingMasker(`{"session_id": "${SESSION_ID}"}`);

      expect(
        mask(masker, "embedded", {
          command: `foo --session_id "${SESSION_ID}"`,
        }),
      ).toEqual({ command: 'foo --session_id "<tool-call.0.session_id>"' });
    });

    it("masks a value in single quotes", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(
        mask(masker, "embedded", { command: "foo --to 'foo@bar.com'" }),
      ).toEqual({ command: "foo --to '<tool-call.0.email>'" });
    });

    it("masks a value quoted inside a JSON string in single quotes", () => {
      const masker = recordingMasker('{"id": "a1"}');

      expect(
        mask(masker, "embedded", { command: `curl -d '{"id": "a1"}'` }),
      ).toEqual({ command: `curl -d '{"id": "<tool-call.0.id>"}'` });
    });

    it("masks a value quoted after a double-quoted apostrophe", () => {
      const masker = recordingMasker('{"id": "a1"}');

      expect(mask(masker, "embedded", { command: `echo "it's" "a1"` })).toEqual(
        { command: `echo "it's" "<tool-call.0.id>"` },
      );
    });

    it("masks a double-quoted value containing an apostrophe", () => {
      const masker = recordingMasker(`{"name": "it's"}`);

      expect(mask(masker, "embedded", { command: `echo "it's"` })).toEqual({
        command: 'echo "<tool-call.0.name>"',
      });
    });

    it("masks every occurrence of the same value", () => {
      const masker = recordingMasker('{"id": "a1"}');

      expect(
        mask(masker, "embedded", { command: 'foo "a1" && bar "a1"' }),
      ).toEqual({
        command: 'foo "<tool-call.0.id>" && bar "<tool-call.0.id>"',
      });
    });

    it("masks a whole input value", () => {
      const masker = recordingMasker('{"path": "/tmp/report.txt"}');

      expect(
        mask(masker, "embedded", { file_path: "/tmp/report.txt" }),
      ).toEqual({ file_path: "<tool-call.0.path>" });
    });

    it("masks a value that is both a whole value and quoted", () => {
      const masker = recordingMasker(`{"session_id": "${SESSION_ID}"}`);

      expect(
        mask(masker, "embedded", {
          session_id: SESSION_ID,
          command: `foo "${SESSION_ID}"`,
        }),
      ).toEqual({
        session_id: "<tool-call.0.session_id>",
        command: 'foo "<tool-call.0.session_id>"',
      });
    });

    it("masks a value between escaped double quotes", () => {
      const masker = recordingMasker(`{"session_id": "${SESSION_ID}"}`);

      expect(
        mask(masker, "embedded", {
          command: `curl -d "{\\"session_id\\": \\"${SESSION_ID}\\"}"`,
        }),
      ).toEqual({
        command: `curl -d "{\\"session_id\\": \\"<tool-call.0.session_id>\\"}"`,
      });
    });

    it("masks a value between doubly escaped quotes", () => {
      const masker = recordingMasker('{"id": "a1"}');

      expect(mask(masker, "embedded", { command: `foo \\\\"a1\\\\"` })).toEqual(
        { command: `foo \\\\"<tool-call.0.id>\\\\"` },
      );
    });

    it("leaves a value whose delimiters escape differently alone", () => {
      // `"a1\"` is not a quoted token - the opening quote is bare and the
      // closing one is escaped, so they belong to two different runs.
      const masker = recordingMasker('{"id": "a1"}');

      expect(mask(masker, "embedded", { command: `foo "a1\\"` })).toEqual({
        command: `foo "a1\\"`,
      });
    });

    it("leaves an unquoted value alone", () => {
      const masker = recordingMasker(`{"session_id": "${SESSION_ID}"}`);

      expect(
        mask(masker, "embedded", {
          command: `foo --session_id ${SESSION_ID}`,
        }),
      ).toEqual({ command: `foo --session_id ${SESSION_ID}` });
    });

    it("leaves a longer token containing the value alone", () => {
      const masker = recordingMasker('{"num": 9}');

      expect(
        mask(masker, "embedded", { command: 'foo --retries "19"' }),
      ).toEqual({ command: 'foo --retries "19"' });
    });

    it("leaves a value quoted in a description alone", () => {
      const masker = recordingMasker('{"id": "a1"}');

      expect(
        mask(masker, "embedded", {
          command: 'foo "a1"',
          description: 'Run foo with "a1"',
        }),
      ).toEqual({
        command: 'foo "<tool-call.0.id>"',
        description: 'Run foo with "a1"',
      });
    });

    it("masks values in a Write content nesting escaped JSON", () => {
      // The shape a hook payload takes: a JSON document whose `text` field is
      // itself a JSON string, so its quotes reach `content` escaped.
      const masker = recordingMasker(
        '{"user": {"token": "tok-37f2", "refresh": "ref-0ff2"}}',
      );
      const inner = String.raw`{\"user\":{\"token\":\"tok-37f2\",\"refresh\":\"ref-0ff2\"}}`;

      expect(
        mask(masker, "embedded", {
          file_path: "/tmp/login-input.json",
          content: `{"tool_response":{"text":"${inner}"}}`,
        }),
      ).toEqual({
        file_path: "/tmp/login-input.json",
        content: `{"tool_response":{"text":"${String.raw`{\"user\":{\"token\":\"<tool-call.0.user.token>\",\"refresh\":\"<tool-call.0.user.refresh>\"}}`}"}}`,
      });
    });

    it("does not mask a quoted value in the whole scope", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(
        mask(masker, "whole", { goal: "type 'foo@bar.com' to username" }),
      ).toEqual({ goal: "type 'foo@bar.com' to username" });
    });
  });

  describe("unmasking in the embedded scope", () => {
    it("substitutes a freshly produced value inside a command", () => {
      const recorded = mask(
        recordingMasker('{"session_id": "854e"}'),
        "embedded",
        { command: 'foo --session_id "854e"' },
      );

      const replayMasker = recordingMasker('{"session_id": "0f1e"}');

      expect(unmask(replayMasker, "embedded", recorded)).toEqual({
        command: 'foo --session_id "0f1e"',
      });
    });

    it("keeps the quote the command used", () => {
      const recorded = mask(
        recordingMasker('{"email": "a@b.com"}'),
        "embedded",
        { command: "foo --to 'a@b.com'" },
      );

      const replayMasker = recordingMasker('{"email": "c@d.com"}');

      expect(unmask(replayMasker, "embedded", recorded)).toEqual({
        command: "foo --to 'c@d.com'",
      });
    });

    it("substitutes every occurrence", () => {
      const recorded = mask(recordingMasker('{"id": "a1"}'), "embedded", {
        command: 'foo "a1" && bar "a1"',
      });

      const replayMasker = recordingMasker('{"id": "b2"}');

      expect(unmask(replayMasker, "embedded", recorded)).toEqual({
        command: 'foo "b2" && bar "b2"',
      });
    });

    it("leaves a quoted mask in place when the fresh output lacks its path", () => {
      const recorded = mask(recordingMasker('{"id": "a1"}'), "embedded", {
        command: 'foo "a1"',
      });

      const replayMasker = recordingMasker('{"other": "b2"}');

      expect(unmask(replayMasker, "embedded", recorded)).toEqual({
        command: 'foo "<tool-call.0.id>"',
      });
    });

    it("leaves a quoted mask in place when the fresh value contains the quote", () => {
      const recorded = mask(recordingMasker('{"name": "alex"}'), "embedded", {
        command: 'foo --name "alex"',
      });

      const replayMasker = recordingMasker('{"name": "al\\"ex"}');

      expect(unmask(replayMasker, "embedded", recorded)).toEqual({
        command: 'foo --name "<tool-call.0.name>"',
      });
    });

    it("leaves a double-quoted mask in place when the fresh value has a backslash", () => {
      const recorded = mask(recordingMasker('{"path": "a/b"}'), "embedded", {
        command: 'foo --path "a/b"',
      });

      const replayMasker = recordingMasker('{"path": "a\\\\b"}');

      expect(unmask(replayMasker, "embedded", recorded)).toEqual({
        command: 'foo --path "<tool-call.0.path>"',
      });
    });

    it("leaves a double-quoted mask in place when the fresh value expands", () => {
      const recorded = mask(recordingMasker('{"dir": "a"}'), "embedded", {
        command: 'ls "a"',
      });

      for (const fresh of ["$HOME", "`id`"])
        expect(
          unmask(
            recordingMasker(JSON.stringify({ dir: fresh })),
            "embedded",
            recorded,
          ),
        ).toEqual({ command: 'ls "<tool-call.0.dir>"' });
    });

    it("substitutes a single-quoted value containing a dollar sign", () => {
      const recorded = mask(recordingMasker('{"dir": "a"}'), "embedded", {
        command: "ls 'a'",
      });

      expect(
        unmask(recordingMasker('{"dir": "$HOME"}'), "embedded", recorded),
      ).toEqual({ command: "ls '$HOME'" });
    });

    it("substitutes a single-quoted value containing a double quote", () => {
      const recorded = mask(recordingMasker('{"name": "alex"}'), "embedded", {
        command: "foo --name 'alex'",
      });

      const replayMasker = recordingMasker('{"name": "al\\"ex"}');

      expect(unmask(replayMasker, "embedded", recorded)).toEqual({
        command: `foo --name 'al"ex'`,
      });
    });

    it("substitutes a value between escaped double quotes", () => {
      const recorded = mask(
        recordingMasker('{"session_id": "854e"}'),
        "embedded",
        {
          command: `curl -d "{\\"session_id\\": \\"854e\\"}"`,
        },
      );

      const replayMasker = recordingMasker('{"session_id": "0f1e"}');

      expect(unmask(replayMasker, "embedded", recorded)).toEqual({
        command: `curl -d "{\\"session_id\\": \\"0f1e\\"}"`,
      });
    });

    it("leaves an escaped-quote mask in place when the fresh value has a quote", () => {
      const recorded = mask(recordingMasker('{"name": "alex"}'), "embedded", {
        command: `foo "{\\"name\\": \\"alex\\"}"`,
      });

      const replayMasker = recordingMasker('{"name": "al\\"ex"}');

      expect(unmask(replayMasker, "embedded", recorded)).toEqual({
        command: `foo "{\\"name\\": \\"<tool-call.0.name>\\"}"`,
      });
    });

    it("leaves an escaped single-quote mask in place when the value has a backslash", () => {
      // Unlike a bare `'`, an escaped one implies a layer that still
      // gives a backslash meaning.
      const recorded = mask(recordingMasker('{"path": "a/b"}'), "embedded", {
        command: `foo \\'a/b\\'`,
      });

      const replayMasker = recordingMasker('{"path": "a\\\\b"}');

      expect(unmask(replayMasker, "embedded", recorded)).toEqual({
        command: `foo \\'<tool-call.0.path>\\'`,
      });
    });

    it("does not substitute a quoted mask in the whole scope", () => {
      const replayMasker = recordingMasker('{"num1": 7}');

      expect(
        unmask(replayMasker, "whole", {
          goal: "press the '<tool-call.0.num1>' button",
        }),
      ).toEqual({ goal: "press the '<tool-call.0.num1>' button" });
    });
  });

  describe("unmasking in the whole scope", () => {
    it("substitutes freshly produced values on playback", () => {
      const recorded = mask(recordingMasker('{"num1": 4}'), "whole", {
        goal: "press the {num1} button",
        params: { num1: "4" },
      });

      // A fresh run of the same tool produces a different value.
      const replayMasker = recordingMasker('{"num1": 7}');

      expect(unmask(replayMasker, "whole", recorded)).toEqual({
        goal: "press the {num1} button",
        params: { num1: "7" },
      });
    });

    it("resolves by path rather than by position", () => {
      const recorded = mask(recordingMasker('{"a": "1", "b": "2"}'), "whole", {
        params: { x: "1" },
      });

      const replayMasker = recordingMasker('{"b": "9", "a": "8", "c": "7"}');

      expect(unmask(replayMasker, "whole", recorded)).toEqual({
        params: { x: "8" },
      });
    });

    it("leaves a mask in place when the fresh output lacks its path", () => {
      const recorded = mask(recordingMasker('{"a": "1"}'), "whole", {
        params: { x: "1" },
      });

      const replayMasker = recordingMasker('{"b": "2"}');

      expect(unmask(replayMasker, "whole", recorded)).toEqual({
        params: { x: "<tool-call.0.a>" },
      });
    });
  });

  describe("registerOutput", () => {
    it("keeps values of separate tool calls apart", () => {
      const masker = new ToolCallMasker();
      masker.registerOutput("0", { a: 4 });
      masker.registerOutput("1", { b: 8 });

      expect(mask(masker, "whole", { params: { x: "4", y: "8" } })).toEqual({
        params: { x: "<tool-call.0.a>", y: "<tool-call.1.b>" },
      });
    });

    it("returns the leaves it registered with their masks", () => {
      const masker = new ToolCallMasker();

      expect(
        masker.registerOutput("2", { a: "1", b: { c: 2 }, d: null }),
      ).toEqual([
        { mask: "<tool-call.2.a>", value: "1" },
        { mask: "<tool-call.2.b.c>", value: "2" },
      ]);
    });

    it("sanitizes path segments of masks", () => {
      const masker = new ToolCallMasker();

      expect(masker.registerOutput("3", { "user email": ["a"] })).toEqual([
        { mask: "<tool-call.3.user_email.0>", value: "a" },
      ]);
    });
  });

  describe("registerContent", () => {
    it("ignores output that is not JSON", () => {
      const masker = new ToolCallMasker();

      expect(masker.registerContent("0", "4\n8")).toEqual([]);
    });

    it("ignores output that is a bare JSON scalar", () => {
      // `JSON.parse` accepts `7`, but there is no key to name the value.
      const masker = new ToolCallMasker();

      expect(masker.registerContent("0", "7")).toEqual([]);
    });

    it("reads JSON out of text result blocks", () => {
      const masker = new ToolCallMasker();

      expect(
        masker.registerContent("0", [
          { type: "text", text: '{"email": "foo@bar.com"}' },
          { type: "image", data: "..." },
        ]),
      ).toEqual([{ mask: "<tool-call.0.email>", value: "foo@bar.com" }]);
    });

    it("normalizes surrounding whitespace", () => {
      // Recording sees the tool result, replay sees the raw stdout.
      const masker = new ToolCallMasker();

      expect(masker.registerContent("0", '{"num1": 7}\n')).toEqual([
        { mask: "<tool-call.0.num1>", value: "7" },
      ]);
    });
  });

  describe("register paths", () => {
    const registerResponsePaths = { "srv/*": [], "srv/start": ["id"] };

    it("registers only the leaves a tool's paths cover", () => {
      const masker = new ToolCallMasker({ registerResponsePaths });

      expect(
        masker.registerContent("0", '{"id": "a", "driver": "x"}', "srv/start"),
      ).toEqual([{ mask: "<tool-call.0.id>", value: "a" }]);
    });

    it("registers nothing for empty paths, not even parsing the output", () => {
      const masker = new ToolCallMasker({ registerResponsePaths });

      expect(masker.registerContent("0", "<tree/>", "srv/fetch")).toEqual([]);
      expect(masker.findLeaks({})).toEqual([]);
    });

    it("registers every leaf of a tool without paths", () => {
      const masker = new ToolCallMasker({ registerResponsePaths });

      expect(
        masker.registerContent("0", '{"a": "1", "b": "2"}', "Bash"),
      ).toEqual([
        { mask: "<tool-call.0.a>", value: "1" },
        { mask: "<tool-call.0.b>", value: "2" },
      ]);
    });

    it("still registers secrets a tool's paths do not cover", () => {
      const masker = new ToolCallMasker({
        registerResponsePaths: { "srv/login": [] },
        maskResponsePaths: { "srv/login": ["token"] },
      });

      expect(
        masker.registerContent("0", '{"id": "u1", "token": "t"}', "srv/login"),
      ).toEqual([{ mask: "<secret.0.token>", value: "t" }]);
    });
  });

  describe("deep secret paths", () => {
    it("masks a secret key at any depth", () => {
      const masker = new ToolCallMasker({
        maskResponsePaths: { "srv/*": ["**.token"] },
      });

      expect(
        masker.registerContent(
          "c",
          '{"token": "t0", "user": {"token": "t1"}, "a": {"b": {"c": {"token": "t3"}}}, "id": "u1"}',
          "srv/createUser",
        ),
      ).toEqual([
        { mask: "<secret.c.a.b.c.token>", value: "t3" },
        { mask: "<tool-call.c.id>", value: "u1" },
        { mask: "<secret.c.token>", value: "t0" },
        { mask: "<secret.c.user.token>", value: "t1" },
      ]);
    });
  });

  describe("colliding secret masks", () => {
    it("masks every secret whose paths sanitize to the same mask", () => {
      const masker = new ToolCallMasker({
        maskResponsePaths: { srv: ["**.token"] },
      });
      const output =
        '{"access-token": {"token": "t1"}, "access_token": {"token": "t2"}}';

      expect(masker.registerContent("c", output, "srv")).toEqual([
        { mask: "<secret.c.access_token.token>", value: "t1" },
        { mask: "<secret.c.access_token.token_2>", value: "t2" },
      ]);
      expect(masker.maskSecrets(output)).not.toMatch(/t1|t2/);
      expect(masker.findLeaks(output)).toEqual([
        "<secret.c.access_token.token>",
        "<secret.c.access_token.token_2>",
      ]);
    });

    it("gives colliding secrets the same masks whatever their key order", () => {
      const masker = new ToolCallMasker({
        maskResponsePaths: { srv: ["**.token"] },
      });
      const output =
        '{"access_token": {"token": "t2"}, "access-token": {"token": "t1"}}';

      expect(masker.registerContent("c", output, "srv")).toEqual([
        { mask: "<secret.c.access_token.token>", value: "t1" },
        { mask: "<secret.c.access_token.token_2>", value: "t2" },
      ]);
    });
  });

  describe("secrets", () => {
    const maskResponsePaths = { "test-data/createUser": ["user.token"] };
    const output = '{"user": {"id": "g1", "token": "tok-37f2"}}';

    function secretsMasker(content = output): ToolCallMasker {
      const masker = new ToolCallMasker({ maskResponsePaths });
      masker.registerContent("0", content, "test-data/createUser");
      return masker;
    }

    it("registers a leaf at a response path as a secret", () => {
      const masker = new ToolCallMasker({ maskResponsePaths });

      expect(
        masker.registerContent("0", output, "test-data/createUser"),
      ).toEqual([
        { mask: "<tool-call.0.user.id>", value: "g1" },
        { mask: "<secret.0.user.token>", value: "tok-37f2" },
      ]);
    });

    it("only applies response paths of the call's tool", () => {
      const masker = new ToolCallMasker({ maskResponsePaths });

      expect(
        masker.registerContent("0", output, "test-data/createOrder"),
      ).toEqual([
        { mask: "<tool-call.0.user.id>", value: "g1" },
        { mask: "<tool-call.0.user.token>", value: "tok-37f2" },
      ]);
    });

    it("masks a secret as a whole value and wherever else it occurs", () => {
      const masker = secretsMasker();

      expect(
        mask(masker, "whole", {
          params: { token: "tok-37f2", id: "g1" },
          goal: "set cookie token=tok-37f2 and open g1",
        }),
      ).toEqual({
        params: { token: "<secret.0.user.token>", id: "<tool-call.0.user.id>" },
        goal: "set cookie token=<secret.0.user.token> and open g1",
      });
    });

    it("masks secrets in a description too", () => {
      const masker = secretsMasker();

      expect(
        mask(masker, "embedded", { description: 'Use "tok-37f2" and "g1"' }),
      ).toEqual({ description: 'Use "<secret.0.user.token>" and "g1"' });
    });

    it("masks only secrets with maskSecrets", () => {
      const masker = secretsMasker();

      expect(masker.maskSecrets(output)).toBe(
        '{"user": {"id": "g1", "token": "<secret.0.user.token>"}}',
      );
    });

    it("substitutes fresh secrets wherever they occur", () => {
      const masker = secretsMasker('{"user": {"token": "tok-38a3"}}');

      expect(
        unmask(masker, "embedded", {
          command: "curl -b token=<secret.0.user.token>",
        }),
      ).toEqual({ command: "curl -b token=tok-38a3" });
      expect(
        unmask(masker, "whole", { params: { token: "<secret.0.user.token>" } }),
      ).toEqual({ params: { token: "tok-38a3" } });
    });

    it("finds secrets that survived masking", () => {
      expect(secretsMasker().findLeaks(["token tok-37f2 g1"])).toEqual([
        "<secret.0.user.token>",
      ]);
    });

    it("reports a call with response paths whose output is not JSON", () => {
      const masker = secretsMasker("token=tok-37f2");

      expect(masker.findLeaks({})).toEqual(["<secret.0>"]);
    });
  });

  describe("masksInputOf", () => {
    it("masks tools replay executes", () => {
      const masker = new ToolCallMasker();
      expect(masker.masksInputOf("Bash")).toBe(true);
      expect(masker.masksInputOf("Read")).toBe(true);
      expect(masker.masksInputOf("create_user")).toBe(true);
    });

    it("masks tools replay cannot execute, to keep values out of the recording", () => {
      const masker = new ToolCallMasker();
      expect(masker.masksInputOf("Write")).toBe(true);
      expect(masker.masksInputOf("Edit")).toBe(true);
    });

    it("leaves a prose-only tool input verbatim", () => {
      expect(new ToolCallMasker().masksInputOf("TodoWrite")).toBe(false);
    });

    it("takes verbatim tools from the constructor", () => {
      const masker = new ToolCallMasker({ verbatimTools: ["Notes"] });
      expect(masker.masksInputOf("Notes")).toBe(false);
      expect(masker.masksInputOf("TodoWrite")).toBe(true);
    });
  });

  describe("findUnresolved", () => {
    it("finds masks nested in params", () => {
      expect(
        ToolCallMasker.findUnresolved({
          goal: "type {email} to username",
          params: { email: "<tool-call.0.email>" },
        }),
      ).toEqual(["<tool-call.0.email>"]);
    });

    it("finds masks nested in arrays", () => {
      expect(
        ToolCallMasker.findUnresolved({
          values: ["<tool-call.0.a>", { nested: "<tool-call.1.b>" }],
        }),
      ).toEqual(["<tool-call.0.a>", "<tool-call.1.b>"]);
    });

    it("finds a mask of a deeply nested path", () => {
      expect(
        ToolCallMasker.findUnresolved({
          params: { id: "<tool-call.10.items.2.id>" },
        }),
      ).toEqual(["<tool-call.10.items.2.id>"]);
    });

    it("ignores a mask that does not take up a whole value", () => {
      expect(
        ToolCallMasker.findUnresolved({
          goal: "press the <tool-call.0.num1> button",
        }),
      ).toEqual([]);
    });

    it("resolves to nothing when everything was substituted", () => {
      expect(
        ToolCallMasker.findUnresolved({
          goal: "press the {num1} button",
          params: { num1: "7" },
        }),
      ).toEqual([]);
    });

    it("finds a secret mask anywhere in a string", () => {
      expect(
        ToolCallMasker.findUnresolved({
          params: { id: "<tool-call.0.id>" },
          command: "curl -b token=<secret.0.user.token>",
        }),
      ).toEqual(["<tool-call.0.id>", "<secret.0.user.token>"]);
    });

    it("does not report host variable masks", () => {
      expect(ToolCallMasker.findUnresolved({ a: "<host-var.A>" })).toEqual([]);
    });
  });
});
