import { describe, expect, it } from "vitest";
import type { Recording } from "../Recording.ts";
import { Masker } from "./Masker.ts";

function recordingMasker(output: Recording.Content, callId = "0"): Masker {
  const masker = createMasker();
  masker.registerOutput(callId, output);
  return masker;
}

// The scope Recorder sets up for Alumnium's own tools.
function createMasker(props: Masker.Props = {}): Masker {
  return new Masker({ wholeValueOnlyTools: ["alumnium/*"], ...props });
}

describe("Masker", () => {
  describe("registerOutput", () => {
    it("ignores output that is not JSON", () => {
      const masker = recordingMasker("4\n8");

      expect(
        masker.maskInput("alumnium/do", { params: { a: "4", b: "8" } }),
      ).toEqual({
        params: { a: "4", b: "8" },
      });
    });

    it("ignores output that is a bare JSON scalar", () => {
      // `JSON.parse` accepts `7`, but there is no key to name the value.
      const masker = recordingMasker("7");

      expect(
        masker.maskInput("alumnium/do", { params: { number: "7" } }),
      ).toEqual({
        params: { number: "7" },
      });
    });

    it("reads JSON out of text result blocks", () => {
      const masker = recordingMasker([
        { type: "text", text: '{"email": "foo@bar.com"}' },
      ]);

      expect(
        masker.maskInput("alumnium/do", { params: { email: "foo@bar.com" } }),
      ).toEqual({ params: { email: "<tool-call.0.email>" } });
    });

    it("normalizes surrounding whitespace", () => {
      // Recording sees the tool result, replay sees the raw stdout.
      const masker = recordingMasker('{"num1": 7}\n');

      expect(
        masker.maskInput("alumnium/do", { params: { num1: "7" } }),
      ).toEqual({
        params: { num1: "<tool-call.0.num1>" },
      });
    });

    it("keeps values of separate tool calls apart", () => {
      const masker = createMasker();
      masker.registerOutput("0", '{"a": 4}');
      masker.registerOutput("1", '{"b": 8}');

      expect(
        masker.maskInput("alumnium/do", { params: { x: "4", y: "8" } }),
      ).toEqual({
        params: { x: "<tool-call.0.a>", y: "<tool-call.1.b>" },
      });
    });
  });

  describe("tool call values", () => {
    it("masks only whole values in an Alumnium tool input", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(
        masker.maskInput("alumnium/do", {
          goal: "type 'foo@bar.com' to username",
          params: { email: "foo@bar.com" },
        }),
      ).toEqual({
        goal: "type 'foo@bar.com' to username",
        params: { email: "<tool-call.0.email>" },
      });
    });

    it("also masks quoted values in a non-Alumnium tool input", () => {
      const masker = recordingMasker('{"email": "foo@bar.com"}');

      expect(
        masker.maskInput("Bash", { command: "foo --to 'foo@bar.com'" }),
      ).toEqual({ command: "foo --to '<tool-call.0.email>'" });
    });

    it("does not mask tool call values in a verbatim tool input", () => {
      const masker = recordingMasker('{"id": "a1"}');

      expect(
        masker.maskInput("TodoWrite", { todos: [{ content: '"a1"' }] }),
      ).toEqual({ todos: [{ content: '"a1"' }] });
      expect(masker.masksToolCallValuesOf("TodoWrite")).toBe(false);
    });

    it("takes verbatim tools from props", () => {
      const masker = createMasker({ verbatimTools: ["Notes"] });

      expect(masker.masksToolCallValuesOf("Notes")).toBe(false);
      expect(masker.masksToolCallValuesOf("TodoWrite")).toBe(true);
    });

    it("substitutes fresh values in both kinds of input", () => {
      const recorder = recordingMasker('{"id": "a1"}');
      const alumniumInput = recorder.maskInput("alumnium/do", {
        params: { id: "a1" },
      });
      const toolCallInput = recorder.maskInput("Bash", {
        command: 'foo "a1"',
      });

      const replayMasker = recordingMasker('{"id": "b2"}');

      expect(replayMasker.unmaskInput("alumnium/do", alumniumInput)).toEqual({
        params: { id: "b2" },
      });
      expect(replayMasker.unmaskInput("Bash", toolCallInput)).toEqual({
        command: 'foo "b2"',
      });
    });
  });

  describe("registerResponsePaths", () => {
    // Recorder's default for Alumnium's own tools.
    const registerResponsePaths = {
      "alumnium/*": [],
      "alumnium/start": ["id"],
    };

    function alumniumMasker(): Masker {
      return createMasker({ registerResponsePaths });
    }

    it("masks the driver id of a start in the inputs that follow", () => {
      const masker = alumniumMasker();
      masker.registerOutput(
        "0",
        '{"id": "typescript-1785192884"}',
        "alumnium/start",
      );

      expect(
        masker.maskInput("alumnium/do", {
          id: "typescript-1785192884",
          goal: "press 4",
        }),
      ).toEqual({ id: "<tool-call.0.id>", goal: "press 4" });
    });

    it("registers nothing of a tool with no paths", () => {
      const masker = alumniumMasker();
      masker.registerOutput("0", '{"waited_seconds": 2}', "alumnium/wait");

      expect(
        masker.maskInput("alumnium/do", { params: { count: "2" } }),
      ).toEqual({
        params: { count: "2" },
      });
    });

    it("only registers the covered paths", () => {
      const masker = alumniumMasker();
      masker.registerOutput(
        "0",
        '{"id": "a", "driver": "playwright", "platform_name": "chromium"}',
        "alumnium/start",
      );

      expect(
        masker.maskInput("alumnium/do", {
          id: "a",
          params: { platform: "chromium" },
        }),
      ).toEqual({ id: "<tool-call.0.id>", params: { platform: "chromium" } });
    });

    it("registers every value of a tool without paths", () => {
      const masker = alumniumMasker();
      masker.registerOutput("0", '{"count": 2}', "test-data/createOrder");

      expect(
        masker.maskInput("alumnium/do", { params: { count: "2" } }),
      ).toEqual({
        params: { count: "<tool-call.0.count>" },
      });
    });

    it("keeps a later non-Alumnium value apart from Alumnium's own", () => {
      const masker = alumniumMasker();
      masker.registerOutput("0", '{"waited_seconds": 2}', "alumnium/wait");
      masker.registerOutput("1", '{"count": 2}', "Bash");

      expect(
        masker.maskInput("alumnium/do", { params: { count: "2" } }),
      ).toEqual({
        params: { count: "<tool-call.1.count>" },
      });
    });

    it("registers a secret even where no path covers it", () => {
      const masker = createMasker({
        registerResponsePaths: { "test-data/createUser": [] },
        maskResponsePaths: { "test-data/createUser": ["token"] },
      });
      masker.registerOutput(
        "0",
        '{"id": "u1", "token": "tok-37f2"}',
        "test-data/createUser",
      );

      expect(
        masker.maskInput("alumnium/do", {
          params: { id: "u1", token: "tok-37f2" },
        }),
      ).toEqual({ params: { id: "u1", token: "<secret.0.token>" } });
    });

    it("masks a driver id in a non-Alumnium tool input too", () => {
      const masker = alumniumMasker();
      masker.registerOutput("0", '{"id": "a"}', "alumnium/start");

      expect(
        masker.maskInput("Bash", { command: 'alumnium stop "a"' }),
      ).toEqual({ command: 'alumnium stop "<tool-call.0.id>"' });
    });

    it("substitutes a freshly started driver id on replay", () => {
      const masker = alumniumMasker();
      masker.registerOutput(
        "3",
        [{ type: "text", text: '{"id": "typescript-1785192999"}' }],
        "alumnium/start",
      );

      expect(
        masker.unmaskInput("alumnium/do", {
          id: "<tool-call.3.id>",
          goal: "press 4",
        }),
      ).toEqual({ id: "typescript-1785192999", goal: "press 4" });
    });

    it("reports a driver id the replay lacks as unresolved", () => {
      const masker = alumniumMasker();
      const input = masker.unmaskInput("alumnium/do", {
        id: "<tool-call.0.id>",
      });

      expect(input).toEqual({ id: "<tool-call.0.id>" });
      expect(Masker.findUnresolvedMasks(input)).toEqual(["<tool-call.0.id>"]);
    });
  });

  describe("host variables", () => {
    const hostVars = {
      BASE_URL: "https://staging.example.com",
      PASSWORD: "p4ssw0rd",
    };

    it("masks host variables in inputs, results and narration", () => {
      const masker = createMasker({ hostVars });

      expect(
        masker.maskInput("alumnium/do", {
          goal: "open https://staging.example.com/login",
        }),
      ).toEqual({ goal: "open <host-var.BASE_URL>/login" });
      expect(
        masker.maskInput("Bash", {
          command: "login --password p4ssw0rd",
        }),
      ).toEqual({ command: "login --password <host-var.PASSWORD>" });
      expect(
        masker.maskResult([{ type: "text", text: "Typed p4ssw0rd" }]),
      ).toEqual([{ type: "text", text: "Typed <host-var.PASSWORD>" }]);
      expect(
        masker.maskResult("Logged in to https://staging.example.com"),
      ).toBe("Logged in to <host-var.BASE_URL>");
      expect(masker.maskNarration("Logging in with p4ssw0rd")).toBe(
        "Logging in with <host-var.PASSWORD>",
      );
    });

    it("masks host variables in a verbatim tool input", () => {
      const masker = createMasker({ hostVars });

      expect(
        masker.maskInput("TodoWrite", {
          todos: ["log in with p4ssw0rd"],
        }),
      ).toEqual({ todos: ["log in with <host-var.PASSWORD>"] });
    });

    it("substitutes fresh host variables in both kinds of input", () => {
      const masker = createMasker({ hostVars: { PASSWORD: "$&pw" } });

      expect(
        masker.unmaskInput("alumnium/do", {
          params: { password: "<host-var.PASSWORD>" },
        }),
      ).toEqual({ params: { password: "$&pw" } });
      expect(
        masker.unmaskInput("Bash", {
          command: "login --password <host-var.PASSWORD>",
        }),
      ).toEqual({ command: "login --password $&pw" });
    });

    it("does not mask inside a secret mask", () => {
      const masker = createMasker({
        hostVars: { USER: "user" },
        maskResponsePaths: { srv: ["**.token"] },
      });
      masker.registerOutput("c", '{"user": {"token": "s3"}}', "srv");

      expect(masker.maskNarration("user has s3")).toBe(
        "<host-var.USER> has <secret.c.user.token>",
      );
    });

    it("keeps JSON valid through a round trip", () => {
      const masker = createMasker({ hostVars: { PASSWORD: 'abc"def' } });
      const content = JSON.stringify({ password: 'abc"def' });

      const masked = masker.maskInput("Write", { content });
      expect(masked).toEqual({
        content: '{"password":"<host-var.PASSWORD:json>"}',
      });
      expect(masker.unmaskInput("Write", masked)).toEqual({ content });
    });

    it("finds host variable names", () => {
      expect(
        Masker.findHostVarNames(["<host-var.A> <host-var.B>", "<host-var.A>"]),
      ).toEqual(["A", "B"]);
    });
  });

  describe("response paths", () => {
    const maskResponsePaths = {
      "test-data/createUser": ["user.token", "sessions.*.token"],
    };
    const output = JSON.stringify({
      user: { id: "g1", token: "tok-37f2" },
      sessions: [{ token: "t0" }, { token: "t1" }],
    });

    function secretsMasker(content: Recording.Content = output): Masker {
      const masker = createMasker({ maskResponsePaths });
      masker.registerOutput("0", content, "test-data/createUser");
      return masker;
    }

    it("masks secrets in the result that produced them", () => {
      const masker = secretsMasker();

      expect(JSON.parse(masker.maskResult(output) as string)).toEqual({
        user: { id: "g1", token: "<secret.0.user.token>" },
        sessions: [
          { token: "<secret.0.sessions.0.token>" },
          { token: "<secret.0.sessions.1.token>" },
        ],
      });
    });

    it("masks secrets in text blocks of a result", () => {
      const masker = secretsMasker([{ type: "text", text: output }]);

      const masked = masker.maskResult([{ type: "text", text: output }]);

      expect(JSON.stringify(masked)).not.toContain("tok-37f2");
      expect(masked).toEqual([
        { type: "text", text: expect.stringContaining('"id":"g1"') },
      ]);
    });

    it("masks a secret wherever it occurs in later inputs", () => {
      const masker = secretsMasker();

      expect(
        masker.maskInput("Bash", {
          command: "curl -H Cookie:token=tok-37f2 https://example.com",
        }),
      ).toEqual({
        command:
          "curl -H Cookie:token=<secret.0.user.token> https://example.com",
      });
      expect(
        masker.maskInput("alumnium/do", {
          params: { token: "tok-37f2", id: "g1" },
        }),
      ).toEqual({
        params: { token: "<secret.0.user.token>", id: "<tool-call.0.user.id>" },
      });
    });

    it("covers every leaf nested under a path", () => {
      const masker = createMasker({ maskResponsePaths: { tool: ["user"] } });
      masker.registerOutput("0", output, "tool");

      expect(masker.maskNarration("g1 tok-37f2 t0")).toBe(
        "<secret.0.user.id> <secret.0.user.token> t0",
      );
    });

    it("only applies to the configured tool", () => {
      const masker = createMasker({ maskResponsePaths });
      masker.registerOutput("0", output, "test-data/createOrder");

      expect(masker.maskResult(output)).toBe(output);
    });

    it("substitutes fresh secrets on replay", () => {
      const recorded = secretsMasker().maskInput("Bash", {
        command: "curl -H Cookie:token=tok-37f2",
      });

      const replayMasker = secretsMasker(
        JSON.stringify({ user: { id: "g2", token: "tok-38a3" }, sessions: [] }),
      );

      expect(replayMasker.unmaskInput("Bash", recorded)).toEqual({
        command: "curl -H Cookie:token=tok-38a3",
      });
    });

    it("reports a secret the replay lacks as unresolved", () => {
      const recorded = secretsMasker().maskInput("Bash", {
        command: "curl -H Cookie:token=tok-37f2",
      });

      const replayMasker = secretsMasker('{"user": {}}');
      const input = replayMasker.unmaskInput("Bash", recorded);

      expect(Masker.findUnresolvedMasks(input)).toEqual([
        "<secret.0.user.token>",
      ]);
    });
  });

  describe("findUnresolvedMasks", () => {
    it("finds whole tool call value masks", () => {
      expect(
        Masker.findUnresolvedMasks({
          goal: "press the <tool-call.0.num1> button",
          params: { email: "<tool-call.0.email>" },
        }),
      ).toEqual(["<tool-call.0.email>"]);
    });

    it("finds host variable and secret masks anywhere in a string", () => {
      expect(
        Masker.findUnresolvedMasks({
          goal: "open <host-var.BASE_URL>/login",
          command: 'curl -H "Authorization: <secret.0.token>"',
        }),
      ).toEqual(["<secret.0.token>", "<host-var.BASE_URL>"]);
    });

    it("reports a mask once", () => {
      expect(
        Masker.findUnresolvedMasks({ a: "<host-var.A>", b: "<host-var.A>" }),
      ).toEqual(["<host-var.A>"]);
    });
  });

  describe("findLeaks", () => {
    it("finds host variables and secrets that survived masking", () => {
      const masker = createMasker({
        hostVars: { PASSWORD: "p4ssw0rd" },
        maskResponsePaths: { tool: ["token"] },
      });
      masker.registerOutput("0", '{"token": "t0"}', "tool");

      expect(
        masker.findLeaks({ steps: [{ text: "p4ssw0rd" }, ["token t0"]] }),
      ).toEqual(["<host-var.PASSWORD>", "<secret.0.token>"]);
    });

    it("finds nothing in masked values", () => {
      const masker = createMasker({ hostVars: { PASSWORD: "p4ssw0rd" } });

      expect(
        masker.findLeaks({ text: masker.maskNarration("type p4ssw0rd") }),
      ).toEqual([]);
    });

    it("reports a call with response paths whose output is not JSON", () => {
      const masker = createMasker({ maskResponsePaths: { tool: ["token"] } });
      masker.registerOutput("3", "token: t0", "tool");

      expect(masker.findLeaks({})).toEqual(["<secret.3>"]);
    });
  });

  it("leaves inputs and results it masks untouched", () => {
    const masker = createMasker({ hostVars: { PASSWORD: "p4ssw0rd" } });
    const input = { params: { password: "p4ssw0rd" } };
    const content = [{ type: "text", text: "p4ssw0rd" }];

    masker.maskInput("alumnium/do", input);
    masker.maskResult(content);

    expect(input).toEqual({ params: { password: "p4ssw0rd" } });
    expect(content).toEqual([{ type: "text", text: "p4ssw0rd" }]);
  });
});
