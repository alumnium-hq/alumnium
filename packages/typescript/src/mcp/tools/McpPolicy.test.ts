import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import { McpState } from "../McpState.ts";
import { startMcpTool } from "./startMcpTool.ts";
import { directMcpTools } from "./directMcpTools.ts";

afterEach(() => {
  vi.restoreAllMocks();
  McpState.clear();
});

it("validates hosted capabilities before reading the filesystem", async () => {
  const exists = vi.spyOn(fs, "existsSync");
  const read = vi.spyOn(fs, "readFileSync");
  await expect(
    startMcpTool.execute(
      { capabilities: "/host/secrets.json" },
      {
        resolveCapabilities() {
          throw new Error("Inline capabilities required");
        },
      },
    ),
  ).rejects.toThrow("Inline capabilities required");
  expect(exists).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});

it("denies direct actions before looking up drivers or touching files", async () => {
  const lookup = vi.spyOn(McpState, "getDriverState");
  for (const name of ["upload", "print_to_pdf"]) {
    const tool = directMcpTools.find((tool) => tool.name === name)!;
    await expect(
      tool.execute(
        { id: "other-user", file_path: "/host/secrets" },
        { allowAction: () => false },
      ),
    ).rejects.toThrow("unavailable");
  }
  expect(lookup).not.toHaveBeenCalled();
});
