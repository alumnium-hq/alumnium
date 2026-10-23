import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "../utils/process.ts";

// NOTE: The logger is configured once per process, so each case runs in its
// own process.
async function log(
  env: Record<string, string>,
  setup = "",
): Promise<{ stdout: string; stderr: string }> {
  const loggerPath = path.join(import.meta.dirname, "Logger.ts");
  const script = `
    import { Logger } from ${JSON.stringify(loggerPath)};
    Logger.level = "info";
    ${setup}
    Logger.get(${JSON.stringify(import.meta.url)}).info("Hello {name}", { name: "Alumnium" });
  `;
  const { status, stdout, stderr } = await spawn("bun", ["-e", script], {
    env: {
      // oxlint-disable-next-line no-process-env -- We need it to pass env vars
      ...process.env,
      ALUMNIUM_LOG_PATH: "",
      ALUMNIUM_LOG_FILENAME: "",
      ...env,
    },
  });
  expect(status, stderr).toBe(0);
  return { stdout, stderr };
}

describe("Logger", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "alumnium-logger-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("logs to stdout by default", async () => {
    const { stdout, stderr } = await log({});
    expect(stdout).toContain("Hello 'Alumnium'");
    expect(stderr).toBe("");
  });

  it("logs to stdout when ALUMNIUM_LOG_PATH is stdout", async () => {
    const { stdout, stderr } = await log({ ALUMNIUM_LOG_PATH: "stdout" });
    expect(stdout).toContain("Hello 'Alumnium'");
    expect(stderr).toBe("");
  });

  it("logs to stderr when ALUMNIUM_LOG_PATH is stderr", async () => {
    const { stdout, stderr } = await log({ ALUMNIUM_LOG_PATH: "stderr" });
    expect(stdout).toBe("");
    expect(stderr).toContain("Hello 'Alumnium'");
  });

  it("redirects stdout logs to stderr when stdout is protected", async () => {
    const { stdout, stderr } = await log(
      { ALUMNIUM_LOG_PATH: "stdout" },
      "Logger.protectStdout();",
    );
    expect(stdout).toBe("");
    expect(stderr).toContain("Hello 'Alumnium'");
  });

  it("doesn't colorize logs written to a pipe", async () => {
    const { stdout } = await log({});
    expect(stdout).not.toContain("\x1b[");
  });

  it("logs to a file when ALUMNIUM_LOG_PATH is a file path", async () => {
    const logPath = path.join(tmpDir, "alumnium.log");
    const { stdout, stderr } = await log({ ALUMNIUM_LOG_PATH: logPath });
    expect(stdout).toBe("");
    expect(stderr).toBe("");
    expect(await fs.readFile(logPath, "utf-8")).toContain("Hello 'Alumnium'");
  });
});
