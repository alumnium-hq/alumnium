import { describe, expect, it, vi } from "vitest";
import { pushMock, pushTeardown } from "../../../alumnium/tests/unit/mocks.ts";
import {
  isCheckFailure,
  parseWaitFor,
  runCliSession,
} from "./CliSessionCommand.ts";
import { CliSessionClient } from "./session/CliSessionClient.ts";

const runCliDaemonMock = vi.hoisted(() => vi.fn());

vi.mock("./session/runCliDaemon.ts", () => ({
  runCliDaemon: runCliDaemonMock,
}));

describe("runCliSession", () => {
  it("starts the daemon with capabilities and server URL from env", async () => {
    setup();
    vi.stubEnv("ALUMNIUM_CLI_DAEMONIZE", "true");
    vi.stubEnv("ALUMNIUM_CLI_START_CAPABILITIES", '{"platformName":"ios"}');
    vi.stubEnv("ALUMNIUM_CLI_START_SERVER_URL", "http://secret.example");
    pushTeardown(() => {
      vi.unstubAllEnvs();
    });
    runCliDaemonMock.mockImplementation(async () => {
      // NOTE: Cleared before the daemon creates browser or driver children.
      /* oxlint-disable no-process-env -- We check the real env */
      expect(process.env.ALUMNIUM_CLI_START_CAPABILITIES).toBeUndefined();
      expect(process.env.ALUMNIUM_CLI_START_SERVER_URL).toBeUndefined();
      /* oxlint-enable no-process-env */
    });

    await runCliSession(["start", "--capabilities", "{}"]);

    expect(runCliDaemonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session: "default",
        capabilities: '{"platformName":"ios"}',
        serverUrl: "http://secret.example",
      }),
    );
  });

  it("joins unquoted goal words", async () => {
    const { run, exit, stdout } = setup('{"explanation":"done"}');

    await runCliSession(["do", "click", "the", "login", "button"]);

    expect(run).toHaveBeenCalledWith("default", "do", {
      goal: "click the login button",
    });
    expect(stdout).toEqual(['{"explanation":"done"}\n']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("passes session and vision to check and exits 1 on failure", async () => {
    const { run, exit } = setup('{"result":"failure","explanation":"no"}');

    await runCliSession(["check", "-s", "work", "logo is shown", "--vision"]);

    expect(run).toHaveBeenCalledWith("work", "check", {
      statement: "logo is shown",
      vision: true,
    });
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("accepts numeric-looking session names", async () => {
    const { run } = setup();

    await runCliSession(["get", "-s", "7", "page", "title"]);

    expect(run).toHaveBeenCalledWith("7", "get", {
      data: "page title",
      vision: false,
    });
  });

  it.each([
    [["wait", "5"], { for: 5, timeout: undefined }],
    [
      ["wait", "--timeout", "20", "user", "is", "logged", "in"],
      { for: "user is logged in", timeout: 20 },
    ],
  ])("maps %j to the wait tool", async (argv, input) => {
    const { run } = setup();

    await runCliSession(argv);

    expect(run).toHaveBeenCalledWith("default", "wait", input);
  });

  it("maps fetch-accessibility-tree to its tool", async () => {
    const { run } = setup("<tree/>");

    await runCliSession(["fetch-accessibility-tree"]);

    expect(run).toHaveBeenCalledWith("default", "fetch_accessibility_tree", {});
  });

  it("stops with cache saving", async () => {
    const { stop, exit } = setup();

    await runCliSession(["stop", "--save-cache"]);

    expect(stop).toHaveBeenCalledWith("default", true);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("lists sessions as JSON without start output", async () => {
    const { list, stdout } = setup();
    list.mockResolvedValue([
      {
        name: "default",
        version: "1.0.0",
        pid: 1,
        socketPath: "/tmp/x.sock",
        driverId: "drv",
        platform: "chrome",
        startedAt: 1,
        startOutput: "{}",
        status: "running",
      },
    ]);

    await runCliSession(["list"]);

    expect(stdout).toEqual([
      '[{"name":"default","platform":"chrome","pid":1,"status":"running"}]\n',
    ]);
  });

  it("prints errors to stderr and exits 1", async () => {
    const { run, exit, stdout, stderr } = setup();
    run.mockRejectedValue(
      new Error(
        "Session 'default' is not running. Run `alumnium cli start` first.",
      ),
    );

    await runCliSession(["do", "anything"]);

    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain(
      "Session 'default' is not running. Run `alumnium cli start` first.",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it.each([["../x"], ["a/b"]])(
    "rejects invalid session name %j",
    async (name) => {
      const { run, exit } = setup();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      pushMock(log);

      await runCliSession(["get", "-s", name, "title"]);

      expect(run).not.toHaveBeenCalled();
      expect(log.mock.calls.flat().join("\n")).toContain(
        "Session name must be 1-24 letters, digits, '_' or '-'",
      );
      expect(exit).toHaveBeenCalledWith(1);
    },
  );

  it("rejects an invalid ALUMNIUM_CLI_SESSION without throwing on import", async () => {
    vi.stubEnv("ALUMNIUM_CLI_SESSION", "../x");
    vi.resetModules();
    pushTeardown(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });
    const { CliSessionClient: Client } =
      await import("./session/CliSessionClient.ts");
    const { runCliSession: run } = await import("./CliSessionCommand.ts");
    const runSpy = vi.spyOn(Client.prototype, "run").mockResolvedValue("{}");
    class ExitCalled extends Error {}
    // NOTE: Throws like a real exit that stops execution.
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new ExitCalled();
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // NOTE: Keeps the reported error out of the test output.
    capture(process.stderr);
    pushMock(runSpy, exit, log);

    await expect(run(["get", "title"])).rejects.toBeInstanceOf(ExitCalled);

    expect(runSpy).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join("\n")).toContain(
      "Session name must be 1-24 letters, digits, '_' or '-'",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("reports missing arguments", async () => {
    const { run, exit, stderr } = setup();

    await runCliSession(["do"]);

    expect(run).not.toHaveBeenCalled();
    expect(stderr.join("")).toContain("missing required args");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("parseWaitFor", () => {
  it("treats numbers as seconds", () => {
    expect(parseWaitFor("5")).toBe(5);
    expect(parseWaitFor("1.5")).toBe(1.5);
  });

  it("treats anything else as a condition", () => {
    expect(parseWaitFor("user is logged in")).toBe("user is logged in");
    expect(parseWaitFor("5 items are shown")).toBe("5 items are shown");
  });
});

describe("isCheckFailure", () => {
  it("detects failed checks", () => {
    expect(isCheckFailure('{"result":"failure","explanation":"no"}')).toBe(
      true,
    );
    expect(isCheckFailure('{"result":"success","explanation":"yes"}')).toBe(
      false,
    );
  });

  it("treats non-JSON output as a failure", () => {
    expect(isCheckFailure("not json")).toBe(true);
  });
});

function setup(text = "{}") {
  const run = vi
    .spyOn(CliSessionClient.prototype, "run")
    .mockResolvedValue(text);
  const stop = vi
    .spyOn(CliSessionClient.prototype, "stop")
    .mockResolvedValue(text);
  const list = vi
    .spyOn(CliSessionClient.prototype, "list")
    .mockResolvedValue([]);
  const exit = vi
    .spyOn(process, "exit")
    .mockImplementation(() => undefined as never);
  pushMock(run, stop, list, exit);
  return {
    run,
    stop,
    list,
    exit,
    stdout: capture(process.stdout),
    stderr: capture(process.stderr),
  };
}

function capture(stream: NodeJS.WriteStream): string[] {
  const chunks: string[] = [];
  const write = vi
    .spyOn(stream, "write")
    .mockImplementation((chunk: unknown, ...rest: unknown[]) => {
      chunks.push(String(chunk));
      const callback = rest.at(-1);
      if (typeof callback === "function") callback();
      return true;
    });
  pushMock(write);
  return chunks;
}
