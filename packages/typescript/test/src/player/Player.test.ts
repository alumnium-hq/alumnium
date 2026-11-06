import { describe, expect, it } from "vitest";
import { Recorder } from "../Recorder.ts";
import type { Recording } from "../Recording.ts";
import { Player } from "./Player.ts";
import type { ToolExecutor } from "./ToolExecutor.ts";

const PASSED: Recording.Verdict = { status: "success", details: "Logged in" };

type Respond = (
  call: ToolExecutor.Call,
  options?: ToolExecutor.ExecuteOptions,
) => Recording.ToolResult | undefined;

interface Executed {
  call: ToolExecutor.Call;
  options: ToolExecutor.ExecuteOptions | undefined;
}

/** Executor of the tools a fresh run has, recording each call. */
function createExecutor(respond: Respond) {
  const executed: Executed[] = [];
  const executor: ToolExecutor = {
    handles: (call) =>
      call.server === "alumnium" ||
      call.server === "data" ||
      (!call.server && call.tool === "Bash"),
    async execute(call, options) {
      executed.push({ call, options });
      return respond(call, options)!;
    },
  };
  return { executor, executed };
}

function text(value: unknown): Recording.Content {
  return [{ type: "text", text: JSON.stringify(value) }];
}

function ok(value: unknown): Recording.ToolResult {
  return { content: text(value), isError: false };
}

function checkResult(result: "success" | "failure") {
  return ok({ result, explanation: "anything" });
}

interface RecordedCall {
  server?: string;
  tool: string;
  input: Record<string, unknown>;
  content: Recording.Content;
  isError?: boolean;
}

/** Records a run of the given calls, each with the id `c<index>`. */
function record(calls: RecordedCall[], props?: Partial<Recorder.Props>) {
  const recorder = new Recorder({ text: "Test", agent: "test", ...props });
  calls.forEach(({ content, isError, ...use }, index) => {
    recorder.onToolUse({ id: `c${index}`, ...use });
    recorder.onToolResult({ id: `c${index}`, content, isError });
  });
  return recorder.finish(PASSED);
}

const START: RecordedCall = {
  server: "alumnium",
  tool: "start",
  input: { capabilities: "{}" },
  content: text({ id: "drv-1" }),
};

function alumnium(
  tool: string,
  input: Record<string, unknown>,
  content = text({}),
) {
  return {
    server: "alumnium",
    tool,
    input: { id: "drv-1", ...input },
    content,
  };
}

const STOP = alumnium("stop", { save_cache: true });

/** Responds as a fresh run would: a fresh driver id and fresh user ids. */
function freshRun(overrides: Respond = () => undefined): Respond {
  return (call, options) => {
    const overridden = overrides(call, options);
    if (overridden) return overridden;

    if (call.server === "alumnium") {
      if (call.tool === "start") return ok({ id: "drv-2" });
      if (call.tool === "check") return checkResult("success");
      return ok({});
    }
    if (call.server === "data" && call.tool === "createUser")
      return ok({ user: { id: "user-2" } });
    if (!call.server && call.tool === "Bash") return ok({ done: true });
    return undefined;
  };
}

describe("Player", () => {
  it("replays a recording with the values the fresh calls produce", async () => {
    const recording = record(
      [
        {
          server: "data",
          tool: "createUser",
          input: {},
          content: text({ user: { id: "user-1" } }),
        },
        {
          tool: "Bash",
          input: { command: `login --user "user-1" --run run-1` },
          content: "{}",
        },
        START,
        alumnium("do", { goal: "open the profile" }),
        alumnium(
          "check",
          { statement: "profile is open" },
          checkResult("success").content,
        ),
        STOP,
      ],
      { hostVars: { RUN_ID: "run-1" } },
    );
    const { executor, executed } = createExecutor(freshRun());

    const player = new Player({ executor, hostVars: { RUN_ID: "run-2" } });
    const result = await player.play(recording);

    expect(result).toEqual({ status: "replayed", verdict: PASSED });
    expect(executed.find(({ call }) => call.tool === "start")?.options).toEqual(
      { meta: { "alumnium.ai/change-analysis": false } },
    );
    expect(executed.map(({ call }) => call)).toEqual([
      { server: "data", tool: "createUser", input: {} },
      { tool: "Bash", input: { command: `login --user "user-2" --run run-2` } },
      { server: "alumnium", tool: "start", input: { capabilities: "{}" } },
      {
        server: "alumnium",
        tool: "do",
        input: { id: "drv-2", goal: "open the profile" },
      },
      {
        server: "alumnium",
        tool: "check",
        input: { id: "drv-2", statement: "profile is open" },
      },
      {
        server: "alumnium",
        tool: "stop",
        input: { id: "drv-2", save_cache: true },
      },
    ]);
  });

  it("reports narration and skips calls that failed when recorded or only exist in the agent", async () => {
    const recorder = new Recorder({ text: "Test", agent: "test" });
    recorder.onNarration({ narration: "thinking", text: "Looking up tools" });
    recorder.onToolUse({ id: "1", tool: "ToolSearch", input: { query: "x" } });
    recorder.onToolResult({ id: "1", content: "[]" });
    recorder.onToolUse({ id: "2", tool: "Bash", input: { command: "flaky" } });
    recorder.onToolResult({ id: "2", content: "boom", isError: true });
    const recording = recorder.finish(PASSED);

    const { executor, executed } = createExecutor(freshRun());
    const narration: string[] = [];
    const skipped: string[] = [];

    const result = await new Player({
      executor,
      observer: {
        onNarration: (step) => narration.push(step.text),
        onToolSkipped: (call, reason) =>
          skipped.push(`${call.tool}: ${reason}`),
      },
    }).play(recording);

    expect(result.status).toBe("replayed");
    expect(executed).toEqual([]);
    expect(narration).toEqual(["Looking up tools"]);
    expect(skipped).toEqual([
      "ToolSearch: it only exists inside the agent",
      "Bash: it failed when recorded",
    ]);
  });

  it("diverges on a tool no executor handles", async () => {
    const recording = record([
      { server: "other", tool: "thing", input: {}, content: text({}) },
    ]);
    const { executor } = createExecutor(freshRun());

    const result = await new Player({ executor }).play(recording);

    expect(result).toEqual({
      status: "diverged",
      error: "No executor for tool 'other/thing'",
      stepIndex: 0,
    });
  });

  it("diverges on a call failing where it did not when recorded, stopping the driver without saving the cache", async () => {
    const recording = record([START, alumnium("do", { goal: "click" }), STOP]);
    const { executor, executed } = createExecutor(
      freshRun((call) =>
        call.tool === "do"
          ? { content: text("No button"), isError: true }
          : undefined,
      ),
    );

    const result = await new Player({ executor }).play(recording);

    expect(result).toEqual({
      status: "diverged",
      error: `Tool 'alumnium/do' failed: "No button"`,
      stepIndex: 1,
    });
    expect(executed.at(-1)?.call).toEqual({
      server: "alumnium",
      tool: "stop",
      input: { id: "drv-2", save_cache: false },
    });
  });

  it("diverges when a fresh call no longer produces a value a later input needs", async () => {
    const recording = record([
      {
        server: "data",
        tool: "createUser",
        input: {},
        content: text({ user: { id: "user-1" } }),
      },
      START,
      alumnium("do", { goal: "log in", params: { user: "user-1" } }),
    ]);
    const { executor } = createExecutor(
      freshRun((call) => (call.tool === "createUser" ? ok({}) : undefined)),
    );

    const result = await new Player({ executor }).play(recording);

    expect(result).toMatchObject({ status: "diverged", stepIndex: 2 });
    expect(result.status === "diverged" && result.error).toMatch(
      /unresolved masks: <tool-call\.c0\.user\.id>/,
    );
  });

  it("diverges when the executor throws", async () => {
    const recording = record([START]);
    const executor: ToolExecutor = {
      handles: () => true,
      execute: async () => {
        throw new Error("Connection closed");
      },
    };

    const result = await new Player({ executor }).play(recording);

    expect(result).toEqual({
      status: "diverged",
      error: "Error: Connection closed",
      stepIndex: 0,
    });
  });

  describe("check", () => {
    const check = (result: "success" | "failure") =>
      record([
        START,
        alumnium(
          "check",
          { statement: "greeting shown" },
          checkResult(result).content,
        ),
        STOP,
      ]);

    async function play(
      recording: Recording.Type,
      replayed: ("success" | "failure")[],
      checkConfirmations = 2,
    ) {
      const verdicts = [...replayed];
      const { executor, executed } = createExecutor(
        freshRun((call) =>
          call.tool === "check"
            ? checkResult(verdicts.shift() ?? "failure")
            : undefined,
        ),
      );
      const outcomes: Player.CheckOutcome[] = [];
      const result = await new Player({
        executor,
        checkConfirmations,
        observer: { onCheck: (_, outcome) => outcomes.push(outcome) },
      }).play(recording);
      const checks = executed.filter(({ call }) => call.tool === "check");
      return { result, outcomes, checks };
    }

    it("agrees with the same verdict", async () => {
      const { result, outcomes, checks } = await play(check("success"), [
        "success",
      ]);

      expect(result.status).toBe("replayed");
      expect(outcomes).toEqual(["agreed"]);
      expect(checks).toHaveLength(1);
    });

    it("continues past a check that passes where it failed when recorded", async () => {
      const { result, outcomes } = await play(check("failure"), ["success"]);

      expect(result.status).toBe("replayed");
      expect(outcomes).toEqual(["improved"]);
    });

    it("re-asks a disagreeing check with the cache bypassed, continuing once it agrees", async () => {
      const { result, outcomes, checks } = await play(check("success"), [
        "failure",
        "failure",
        "success",
      ]);

      expect(result.status).toBe("replayed");
      expect(outcomes).toEqual(["unstable"]);
      expect(checks.map(({ options }) => options)).toEqual([
        undefined,
        { meta: { "alumnium.ai/cache": false } },
        { meta: { "alumnium.ai/cache": false } },
      ]);
    });

    it("diverges on a check that keeps disagreeing", async () => {
      const { result, outcomes, checks } = await play(check("success"), [
        "failure",
        "failure",
        "failure",
      ]);

      expect(result).toEqual({
        status: "diverged",
        error:
          "Check 'greeting shown' failed where it passed when recorded, re-asked 2 times with the cache bypassed",
        stepIndex: 1,
      });
      expect(outcomes).toEqual(["disagreed"]);
      expect(checks).toHaveLength(3);
    });

    it("diverges at once without confirmations", async () => {
      const { result, checks } = await play(check("success"), ["failure"], 0);

      expect(result).toMatchObject({
        status: "diverged",
        error: "Check 'greeting shown' failed where it passed when recorded",
      });
      expect(checks).toHaveLength(1);
    });
  });
});
