import { expect, it } from "vitest";
import { exec, spawn } from "./process.ts";

it("collects stdout and stderr and preserves an unsuccessful exit status", async () => {
  const result = await spawn(process.execPath, [
    "-e",
    "process.stdout.write('Todo📝'); process.stderr.write('launch failed'); process.exitCode = 7",
  ]);
  expect(result).toEqual({
    status: 7,
    stdout: "Todo📝",
    stderr: "launch failed",
  });
});

it("rejects when the executable cannot be started", async () => {
  await expect(
    spawn("/nonexistent/alumnium-spawn-test", []),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

it("terminates a process after the timeout", async () => {
  const result = await spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { timeout: 100 },
  );
  expect(result.status).toBeNull();
});

it("passes shell metacharacters and empty strings as literal arguments", async () => {
  const args = [
    "",
    "milk's task",
    "$(echo unexpected)",
    "`echo unexpected`",
    "a\nb",
    "a; b",
  ];
  const { stdout } = await exec(process.execPath, [
    "-e",
    "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
    ...args,
  ]);
  expect(JSON.parse(stdout)).toEqual(args);
});

it("passes launch environment values without shell expansion", async () => {
  const { stdout } = await exec(
    process.execPath,
    ["-e", "process.stdout.write(process.env.ALUMNIUM_EXEC_TEST)"],
    { env: { ALUMNIUM_EXEC_TEST: "milk's $(echo bread)" } },
  );
  expect(stdout).toBe("milk's $(echo bread)");
});

it("rejects failed commands with their diagnostic output", async () => {
  await expect(
    exec(process.execPath, [
      "-e",
      "process.stderr.write('install failed'); process.exitCode = 7",
    ]),
  ).rejects.toThrow("exited with status 7: install failed");
});

it("rejects commands terminated by the timeout", async () => {
  await expect(
    exec(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      timeout: 100,
    }),
  ).rejects.toThrow("exited with status null");
});
