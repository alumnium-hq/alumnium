import { describe, expect, it } from "vitest";
import { ALUMNIUM_VERSION } from "@alumnium/core/internal";
import { Masker } from "./masker/Masker.ts";
import { Recorder } from "./Recorder.ts";
import { Recording } from "./Recording.ts";
import { RecordingLeakError } from "./RecordingLeakError.ts";

const TEXT = "Log in and check the greeting";
const PASSED: Recording.Verdict = { status: "success", details: "Logged in" };

function createRecorder(props?: Partial<Recorder.Props>): Recorder {
  return new Recorder({ text: TEXT, agent: "test-agent", ...props });
}

function text(value: string) {
  return [{ type: "text", text: value }];
}

describe("Recorder", () => {
  it("records a schema-valid recording", () => {
    const recorder = createRecorder();
    recorder.onNarration({ narration: "thinking", text: "Starting" });
    recorder.onToolUse({
      id: "1",
      server: "alumnium",
      tool: "start",
      input: { capabilities: "{}" },
    });
    recorder.onToolResult({ id: "1", content: text('{"id": "drv-1"}') });

    const recording = recorder.finish(PASSED);

    expect(Recording.Schema.parse(recording)).toEqual(recording);
    expect(recording).toMatchObject({
      id: Recording.textToId(TEXT),
      version: 1,
      text: TEXT,
      agent: "test-agent",
      alumnium: { version: ALUMNIUM_VERSION },
      hostVars: [],
      verdict: PASSED,
    });
    expect(recording.steps).toEqual([
      { kind: "narration", narration: "thinking", text: "Starting" },
      {
        kind: "tool-call",
        call: {
          id: "1",
          server: "alumnium",
          tool: "start",
          input: { capabilities: "{}" },
        },
        result: { content: text('{"id": "drv-1"}'), isError: false },
      },
    ]);
  });

  it("masks only whole values in Alumnium inputs, by the server name", () => {
    const recorder = createRecorder({ alumniumServer: "al" });
    recorder.onToolUse({ id: "b", tool: "Bash", input: {} });
    recorder.onToolResult({ id: "b", content: '{"email": "a@b.com"}' });
    for (const [id, server] of [
      ["1", "al"],
      ["2", "alumnium"],
    ] as const) {
      recorder.onToolUse({
        id,
        server,
        tool: "do",
        input: { goal: "type 'a@b.com'" },
      });
      recorder.onToolResult({ id, content: "" });
    }
    recorder.onToolUse({ id: "3", tool: "Bash", input: { command: "ls" } });
    recorder.onToolResult({ id: "3", content: "", isError: true });

    const { steps } = recorder.finish(PASSED);

    expect(steps.map((step) => step.kind)).toEqual([
      "tool-call",
      "tool-call",
      "tool-call",
      "tool-call",
    ]);
    expect(steps[1]).toMatchObject({
      call: { server: "al", input: { goal: "type 'a@b.com'" } },
    });
    expect(steps[2]).toMatchObject({
      call: {
        server: "alumnium",
        input: { goal: "type '<tool-call.b.email>'" },
      },
    });
    expect(steps[3]).toMatchObject({
      call: { tool: "Bash" },
      result: { isError: true },
    });
    expect(steps[3]).not.toHaveProperty("call.server");
  });

  it("masks driver ids and tool call values in later calls", () => {
    const recorder = createRecorder();
    recorder.onToolUse({
      id: "s",
      server: "alumnium",
      tool: "start",
      input: {},
    });
    recorder.onToolResult({ id: "s", content: text('{"id": "drv-1"}') });
    recorder.onToolUse({
      id: "b",
      tool: "Bash",
      input: { command: 'echo \'{"email": "a@b.com"}\'' },
    });
    recorder.onToolResult({ id: "b", content: '{"email": "a@b.com"}' });
    recorder.onToolUse({
      id: "d",
      server: "alumnium",
      tool: "do",
      input: {
        id: "drv-1",
        goal: "type {email}",
        params: { email: "a@b.com" },
      },
    });
    recorder.onToolResult({ id: "d", content: text("{}") });

    const { steps } = recorder.finish(PASSED);

    expect(steps[1]).toMatchObject({
      call: { input: { command: 'echo \'{"email": "a@b.com"}\'' } },
      result: { content: '{"email": "a@b.com"}' },
    });
    expect(steps[2]).toMatchObject({
      call: {
        input: {
          id: "<tool-call.s.id>",
          goal: "type {email}",
          params: { email: "<tool-call.b.email>" },
        },
      },
    });
  });

  it("pairs parallel calls by id", () => {
    const recorder = createRecorder();
    recorder.onToolUse({ id: "a", tool: "Bash", input: { command: "a" } });
    recorder.onToolUse({ id: "b", tool: "Bash", input: { command: "b" } });
    recorder.onToolResult({ id: "b", content: '{"value": "from-b"}' });
    recorder.onToolResult({ id: "a", content: '{"value": "from-a"}' });
    recorder.onToolUse({
      id: "c",
      server: "alumnium",
      tool: "check",
      input: { params: { x: "from-a", y: "from-b" } },
    });
    recorder.onToolResult({ id: "c", content: text("true") });

    const { steps } = recorder.finish(PASSED);

    expect(
      steps.map((step) => step.kind !== "narration" && step.call.id),
    ).toEqual(["b", "a", "c"]);
    expect(steps[2]).toMatchObject({
      call: {
        input: {
          params: { x: "<tool-call.a.value>", y: "<tool-call.b.value>" },
        },
      },
    });
  });

  it("does not mask a call's input with a value produced after it was issued", () => {
    const recorder = createRecorder();
    recorder.onToolUse({ id: "a", tool: "Bash", input: { command: "a" } });
    recorder.onToolUse({
      id: "c",
      server: "alumnium",
      tool: "do",
      input: { params: { x: "v" } },
    });
    recorder.onToolResult({ id: "a", content: '{"value": "v"}' });
    recorder.onToolResult({ id: "c", content: text("{}") });

    const { steps } = recorder.finish(PASSED);

    expect(steps[1]).toMatchObject({ call: { input: { params: { x: "v" } } } });
  });

  it("registers nothing from a failed tool call", () => {
    const recorder = createRecorder();
    recorder.onToolUse({ id: "a", tool: "Bash", input: {} });
    recorder.onToolResult({
      id: "a",
      content: '{"value": "x"}',
      isError: true,
    });
    recorder.onToolUse({ id: "b", tool: "Bash", input: {} });
    recorder.onToolResult({ id: "b", content: '{"value": "y"}' });
    recorder.onToolUse({
      id: "c",
      server: "alumnium",
      tool: "do",
      input: { params: { x: "x", y: "y" } },
    });
    recorder.onToolResult({ id: "c", content: text("{}") });

    const { steps } = recorder.finish(PASSED);

    expect(steps[2]).toMatchObject({
      call: { input: { params: { x: "x", y: "<tool-call.b.value>" } } },
    });
  });

  it("records the version the host sets", () => {
    expect(createRecorder({ version: 3 }).finish(PASSED).version).toBe(3);
  });

  it("ignores a result of an unknown call", () => {
    const recorder = createRecorder();
    recorder.onToolResult({ id: "nope", content: "" });

    expect(recorder.finish(PASSED).steps).toEqual([]);
  });

  it("drops calls with no result on finish", () => {
    const recorder = createRecorder();
    recorder.onToolUse({ id: "a", tool: "Bash", input: {} });

    expect(recorder.finish(PASSED).steps).toEqual([]);
  });

  it("drops empty narration", () => {
    const recorder = createRecorder();
    recorder.onNarration({ narration: "assistant", text: "  \n" });

    expect(recorder.finish(PASSED).steps).toEqual([]);
  });

  it("rejects events after finish", () => {
    const recorder = createRecorder();
    recorder.finish(PASSED);

    expect(() =>
      recorder.onNarration({ narration: "assistant", text: "late" }),
    ).toThrow("already finished");
    expect(() => recorder.finish(PASSED)).toThrow("already finished");
  });

  it("rejects non-object tool input", () => {
    const recorder = createRecorder();

    expect(() =>
      recorder.onToolUse({ id: "a", tool: "Bash", input: "ls" }),
    ).toThrow(TypeError);
  });

  describe("Alumnium outputs", () => {
    it("registers only the driver id of a start", () => {
      const recorder = createRecorder();
      recorder.onToolUse({
        id: "s",
        server: "alumnium",
        tool: "start",
        input: {},
      });
      recorder.onToolResult({
        id: "s",
        content: text('{"id": "drv-1", "platform_name": "chromium"}'),
      });
      recorder.onToolUse({
        id: "w",
        server: "alumnium",
        tool: "wait",
        input: { for: 2 },
      });
      recorder.onToolResult({
        id: "w",
        content: text('{"waited_seconds": 2}'),
      });
      recorder.onToolUse({ id: "b", tool: "Bash", input: {} });
      recorder.onToolResult({ id: "b", content: '{"count": 2}' });
      recorder.onToolUse({
        id: "d",
        server: "alumnium",
        tool: "do",
        input: {
          id: "drv-1",
          params: { count: "2", platform: "chromium" },
        },
      });
      recorder.onToolResult({ id: "d", content: text("{}") });

      const { steps } = recorder.finish(PASSED);

      expect(steps[3]).toMatchObject({
        call: {
          input: {
            id: "<tool-call.s.id>",
            params: { count: "<tool-call.b.count>", platform: "chromium" },
          },
        },
      });
    });

    it("lets the host override Alumnium's register paths", () => {
      const recorder = createRecorder({
        registerResponsePaths: { "alumnium/get": [] },
        alumniumServer: "al",
      });
      recorder.onToolUse({ id: "g", server: "al", tool: "get", input: {} });
      recorder.onToolResult({ id: "g", content: text('{"title": "Home"}') });
      recorder.onToolUse({
        id: "d",
        server: "al",
        tool: "do",
        input: { params: { title: "Home" } },
      });
      recorder.onToolResult({ id: "d", content: text("{}") });

      const { steps } = recorder.finish(PASSED);

      expect(steps[1]).toMatchObject({
        call: { input: { params: { title: "Home" } } },
      });
    });

    it("applies the default to a custom server name", () => {
      const recorder = createRecorder({ alumniumServer: "al" });
      recorder.onToolUse({ id: "s", server: "al", tool: "start", input: {} });
      recorder.onToolResult({ id: "s", content: text('{"id": "drv-1"}') });
      recorder.onToolUse({ id: "w", server: "al", tool: "wait", input: {} });
      recorder.onToolResult({
        id: "w",
        content: text('{"waited_seconds": 2}'),
      });
      recorder.onToolUse({
        id: "d",
        server: "al",
        tool: "do",
        input: { id: "drv-1", params: { count: "2" } },
      });
      recorder.onToolResult({ id: "d", content: text("{}") });

      const { steps } = recorder.finish(PASSED);

      expect(steps[2]).toMatchObject({
        call: { input: { id: "<tool-call.s.id>", params: { count: "2" } } },
      });
    });
  });

  describe("host variables", () => {
    const hostVars = { PASSWORD: "p4ssw0rd", UNUSED: "never-seen" };

    it("masks host variables everywhere and lists the ones used", () => {
      const recorder = createRecorder({ hostVars });
      recorder.onNarration({ narration: "assistant", text: "Using p4ssw0rd" });
      recorder.onToolUse({
        id: "d",
        server: "alumnium",
        tool: "do",
        input: { goal: "type {pw}", params: { pw: "p4ssw0rd" } },
      });
      recorder.onToolResult({ id: "d", content: text("typed p4ssw0rd") });

      const recording = recorder.finish({
        status: "success",
        details: "Typed p4ssw0rd",
      });

      expect(JSON.stringify(recording)).not.toContain("p4ssw0rd");
      expect(recording.hostVars).toEqual(["PASSWORD"]);
      expect(recording.verdict.details).toBe("Typed <host-var.PASSWORD>");
    });

    it("lists the host variables only the verdict uses", () => {
      const recorder = createRecorder({ hostVars });

      const recording = recorder.finish({
        status: "success",
        details: "Typed p4ssw0rd",
      });

      expect(recording.hostVars).toEqual(["PASSWORD"]);
    });

    it("does not report a host variable in a call id or a mask as a leak", () => {
      const recorder = createRecorder({
        hostVars: { ACCOUNT: "42", ROLE: "user" },
        maskResponsePaths: { "test-data/createUser": ["user.token"] },
      });
      recorder.onToolUse({
        id: "toolu_42",
        server: "test-data",
        tool: "createUser",
        input: {},
      });
      recorder.onToolResult({
        id: "toolu_42",
        content: text('{"user": {"token": "tok-37f2"}}'),
      });

      const recording = recorder.finish(PASSED);

      expect(recording.steps[0]).toMatchObject({
        call: { id: "toolu_42" },
        result: {
          content: text(
            '{"<host-var.ROLE>": {"token": "<secret.toolu_42.user.token>"}}',
          ),
        },
      });
    });

    it("does not mask the test text", () => {
      const recorder = createRecorder({
        text: "Log in with p4ssw0rd",
        hostVars,
      });

      const recording = recorder.finish(PASSED);

      expect(recording.text).toBe("Log in with p4ssw0rd");
      expect(recording.id).toBe(Recording.textToId("Log in with p4ssw0rd"));
    });
  });

  describe("response paths", () => {
    const maskResponsePaths = { "test-data/createUser": ["user.token"] };

    it("keeps secrets out of the recording", () => {
      const recorder = createRecorder({ maskResponsePaths });
      recorder.onToolUse({
        id: "g",
        server: "test-data",
        tool: "createUser",
        input: {},
      });
      recorder.onToolResult({
        id: "g",
        content: text('{"user": {"id": "g1", "token": "tok-37f2"}}'),
      });
      recorder.onToolUse({
        id: "b",
        tool: "Bash",
        input: { command: "curl -b token=tok-37f2 https://example.com" },
      });
      recorder.onToolResult({ id: "b", content: "ok" });

      const recording = recorder.finish(PASSED);

      expect(JSON.stringify(recording)).not.toContain("tok-37f2");
      expect(recording.steps[0]).toMatchObject({
        call: { server: "test-data", tool: "createUser" },
        result: {
          content: text(
            '{"user": {"id": "g1", "token": "<secret.g.user.token>"}}',
          ),
        },
      });
      expect(recording.steps[1]).toMatchObject({
        call: {
          input: {
            command: "curl -b token=<secret.g.user.token> https://example.com",
          },
        },
      });
    });

    it("masks secrets in a failed result", () => {
      const recorder = createRecorder({ maskResponsePaths });
      recorder.onToolUse({
        id: "g",
        server: "test-data",
        tool: "createUser",
        input: {},
      });
      recorder.onToolResult({
        id: "g",
        content: text('{"user": {"id": "g1", "token": "tok-37f2"}}'),
        isError: true,
      });
      recorder.onToolUse({
        id: "d",
        server: "alumnium",
        tool: "do",
        input: { params: { id: "g1" } },
      });
      recorder.onToolResult({ id: "d", content: text("{}") });

      const recording = recorder.finish(PASSED);

      expect(JSON.stringify(recording)).not.toContain("tok-37f2");
      expect(recording.steps[1]).toMatchObject({
        call: { input: { params: { id: "g1" } } },
      });
    });

    it("masks a secret in what came before the call producing it", () => {
      const recorder = createRecorder({ maskResponsePaths });
      recorder.onToolUse({
        id: "g",
        server: "test-data",
        tool: "createUser",
        input: {},
      });
      recorder.onToolUse({ id: "b", tool: "Bash", input: { command: "cat" } });
      recorder.onToolResult({ id: "b", content: "token tok-37f2" });
      recorder.onNarration({ narration: "thinking", text: "Got tok-37f2" });
      recorder.onToolResult({
        id: "g",
        content: text('{"user": {"id": "g1", "token": "tok-37f2"}}'),
      });

      const recording = recorder.finish(PASSED);

      expect(JSON.stringify(recording)).not.toContain("tok-37f2");
      expect(recording.steps.slice(0, 2)).toMatchObject([
        { result: { content: "token <secret.g.user.token>" } },
        { text: "Got <secret.g.user.token>" },
      ]);
    });

    it("refuses to finish when a secret output could not be masked", () => {
      const recorder = createRecorder({ maskResponsePaths });
      recorder.onToolUse({
        id: "g",
        server: "test-data",
        tool: "createUser",
        input: {},
      });
      recorder.onToolResult({ id: "g", content: text("token=tok-37f2") });

      expect(() => recorder.finish(PASSED)).toThrow(RecordingLeakError);
    });
  });

  it("reports leaks by mask, never by value", () => {
    const masker = new Masker({ hostVars: { PASSWORD: "p4ssw0rd" } });
    const error = new RecordingLeakError(masker.findLeaks(["p4ssw0rd"]));

    expect(error.masks).toEqual(["<host-var.PASSWORD>"]);
    expect(error.message).toContain("<host-var.PASSWORD>");
    expect(error.message).not.toContain("p4ssw0rd");
  });
});
