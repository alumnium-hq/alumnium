import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import { describe, it } from "vitest";
import { Env } from "../../src/Env.ts";
import { safePathJoin } from "../../src/utils/fs.ts";

const PAGE = `
  <title>CLI Counter</title>
  <h1>Counter</h1>
  <p id="count">0</p>
  <button onclick="const c = document.getElementById('count'); c.textContent = Number(c.textContent) + 1">Increment</button>
`;

describe("CLI", () => {
  it("drives one session across invocations", async ({
    expect,
    onTestFinished,
    skip,
  }) => {
    if (Env.ALUMNIUM_DRIVER !== "playwright")
      skip("The CLI starts its own Playwright browser");

    const storeDir = await fs.mkdtemp(
      safePathJoin(os.tmpdir(), "alumnium-cli-system-"),
    );
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(PAGE);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    onTestFinished(async () => {
      await alumnium("stop");
      server.close();
      await fs.rm(storeDir, { recursive: true, force: true });
    });

    const capabilities = JSON.stringify({
      platformName: "chrome",
      "alumnium:options": {
        headless: true,
        baseUrl: `http://127.0.0.1:${port}`,
      },
    });

    const start = await alumnium("start", "--capabilities", capabilities);
    expect(start.code, start.stderr).toBe(0);
    expect(JSON.parse(start.stdout)).toMatchObject({ platform_name: "chrome" });

    const again = await alumnium("start", "--capabilities", capabilities);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("is already running");

    const list = await alumnium("list");
    expect(JSON.parse(list.stdout)).toMatchObject([
      { name: "default", status: "running" },
    ]);
    const { pid } = JSON.parse(list.stdout)[0];

    expect((await alumnium("do", "click the Increment button")).code).toBe(0);

    const passed = await alumnium("check", "the counter shows 1");
    expect(passed.code, passed.stdout).toBe(0);
    expect(JSON.parse(passed.stdout)).toMatchObject({ result: "success" });

    const failed = await alumnium("check", "the counter shows 5");
    expect(failed.code).toBe(1);
    expect(JSON.parse(failed.stdout)).toMatchObject({ result: "failure" });

    const value = await alumnium("get", "the counter value");
    expect(String(JSON.parse(value.stdout))).toBe("1");

    expect((await alumnium("fetch-accessibility-tree")).stdout).toContain(
      "Increment",
    );

    const stop = await alumnium("stop", "--save-cache");
    expect(stop.code, stop.stderr).toBe(0);
    expect(JSON.parse(stop.stdout)).toHaveProperty("artifacts_dir");
    // NOTE: test-system.sh sets ALUMNIUM_CACHE_PATH when verifying the cache.
    const cachePath =
      Env.ALUMNIUM_CACHE_PATH ?? safePathJoin(storeDir, "cache");
    await expect(fs.stat(cachePath)).resolves.toBeTruthy();

    await expect
      .poll(() => isProcessRunning(pid), { timeout: 10_000 })
      .toBe(false);

    const after = await alumnium("do", "click the Increment button");
    expect(after.code).toBe(1);
    expect(after.stderr).toContain("Session 'default' is not running");
    expect(JSON.parse((await alumnium("list")).stdout)).toEqual([]);

    function alumnium(
      ...args: string[]
    ): Promise<{ code: number; stdout: string; stderr: string }> {
      return new Promise((resolve) => {
        execFile(
          "bun",
          ["src/cli/bin.ts", "cli", ...args],
          {
            // oxlint-disable-next-line no-process-env -- We need it to pass env vars
            env: { ...process.env, ALUMNIUM_STORE_DIR: storeDir },
            maxBuffer: 64 * 1024 * 1024,
          },
          (error, stdout, stderr) => {
            const code = typeof error?.code === "number" ? error.code : 0;
            resolve({ code, stdout, stderr });
          },
        );
      });
    }
  });
});

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
