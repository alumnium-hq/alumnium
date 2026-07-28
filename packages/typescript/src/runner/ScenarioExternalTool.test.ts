import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createMockDir, setupBeforeEach } from "../../tests/unit/mocks.ts";
import { ScenarioExternalTool } from "./ScenarioExternalTool.ts";

describe("ScenarioExternalTool", () => {
  describe("isSupported", () => {
    it("knows which tools can be executed", () => {
      expect(ScenarioExternalTool.isSupported("Bash")).toBe(true);
      expect(ScenarioExternalTool.isSupported("Read")).toBe(true);
      expect(ScenarioExternalTool.isSupported("ToolSearch")).toBe(false);
    });
  });

  describe("Bash", () => {
    it("returns command output", async () => {
      await expect(
        ScenarioExternalTool.execute("Bash", { command: "echo 4; echo 8" }),
      ).resolves.toEqual({ status: "executed", output: "4\n8\n" });
    });

    it("fails on a non-zero exit code", async () => {
      const result = await ScenarioExternalTool.execute("Bash", {
        command: "echo boom >&2; exit 3",
      });

      expect(result).toMatchObject({ status: "failure" });
      expect(result).toHaveProperty(
        "error",
        expect.stringContaining("exited with code 3"),
      );
    });

    it("stops waiting once the timeout elapses", async () => {
      const startedAt = performance.now();
      const result = await ScenarioExternalTool.execute("Bash", {
        command: "sleep 5; echo late",
        timeout: 200,
      });

      expect(result).toMatchObject({ status: "failure" });
      expect(result).toHaveProperty(
        "error",
        expect.stringContaining("timed out after 200ms"),
      );
      // The command sleeps for 5s, so waiting it out would blow past this.
      expect(performance.now() - startedAt).toBeLessThan(2000);
    });

    it("does not execute background commands", async () => {
      await expect(
        ScenarioExternalTool.execute("Bash", {
          command: "echo 4",
          run_in_background: true,
        }),
      ).resolves.toMatchObject({ status: "unsupported" });
    });

    it("fails when the input has no command", async () => {
      await expect(
        ScenarioExternalTool.execute("Bash", {}),
      ).resolves.toMatchObject({ status: "failure" });
    });
  });

  describe("Read", () => {
    const setup = setupBeforeEach(async () => {
      const mockDir = await createMockDir();
      const filePath = `${mockDir.path}/lines.txt`;
      await fs.writeFile(filePath, "one\ntwo\nthree\nfour\n");
      return { filePath };
    });

    it("returns file contents", async () => {
      const { filePath } = setup.cur;

      await expect(
        ScenarioExternalTool.execute("Read", { file_path: filePath }),
      ).resolves.toEqual({
        status: "executed",
        output: "one\ntwo\nthree\nfour\n",
      });
    });

    it("applies a 1-based offset and a limit", async () => {
      const { filePath } = setup.cur;

      await expect(
        ScenarioExternalTool.execute("Read", {
          file_path: filePath,
          offset: 2,
          limit: 2,
        }),
      ).resolves.toEqual({ status: "executed", output: "two\nthree" });
    });

    it("does not reproduce PDF page extraction", async () => {
      const { filePath } = setup.cur;

      await expect(
        ScenarioExternalTool.execute("Read", {
          file_path: filePath,
          pages: "1-2",
        }),
      ).resolves.toMatchObject({ status: "unsupported" });
    });

    it("fails when the file is missing", async () => {
      await expect(
        ScenarioExternalTool.execute("Read", {
          file_path: "/nope/missing.txt",
        }),
      ).resolves.toMatchObject({ status: "failure" });
    });
  });

  describe("unknown tools", () => {
    it("reports them as unsupported with a reason", async () => {
      await expect(
        ScenarioExternalTool.execute("ToolSearch", { query: "x" }),
      ).resolves.toEqual({
        status: "unsupported",
        reason: "no executor for 'ToolSearch'",
      });
    });
  });
});
