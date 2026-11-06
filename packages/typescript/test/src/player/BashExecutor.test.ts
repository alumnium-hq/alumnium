import { describe, expect, it } from "vitest";
import { BashExecutor } from "./BashExecutor.ts";

function bash(command: string, timeout?: number) {
  return { tool: "Bash", input: { command, ...(timeout ? { timeout } : {}) } };
}

describe("BashExecutor", () => {
  const executor = new BashExecutor({
    allow: ["echo ", /^exit \d+$/, "sleep "],
    env: { REPLAY_VAR: "fresh" },
  });

  it("handles only the host Bash tool", () => {
    expect(executor.handles(bash("echo"))).toBe(true);
    expect(executor.handles({ ...bash("echo"), server: "shell" })).toBe(false);
    expect(executor.handles({ tool: "Read", input: {} })).toBe(false);
  });

  it("returns stdout of a command that succeeds, leaving stderr out", async () => {
    const result = await executor.execute(
      bash(`echo '{"value": "'$REPLAY_VAR'"}'; echo noise >&2`),
    );

    expect(result).toEqual({ content: '{"value": "fresh"}\n', isError: false });
  });

  it("reports a command that fails as an error", async () => {
    const result = await executor.execute(bash("exit 3"));

    expect(result).toEqual({ content: "Exit code 3", isError: true });
  });

  it("refuses a command it does not allow", async () => {
    await expect(executor.execute(bash("rm -rf /tmp/x"))).rejects.toThrow(
      "Command is not allowed to replay: rm -rf /tmp/x",
    );
  });

  it("kills a command that times out", async () => {
    const result = await executor.execute(bash("sleep 5", 50));

    expect(result.isError).toBe(true);
  });
});
