import type { Page } from "playwright-core";
import { describe, expect, it, vi } from "vitest";
import { Alumni } from "./Alumni.ts";
import { BaseTool, type ToolClass } from "../tools/BaseTool.ts";
import { ClickTool } from "../tools/ClickTool.ts";
import { UploadTool } from "../tools/UploadTool.ts";
import { PrintToPdfTool } from "../tools/PrintToPdfTool.ts";

vi.mock("../drivers/PlaywrightDriver.ts", () => ({
  PlaywrightDriver: class {
    kind = "playwright";
    platform = "chromium";
    supportedTools = new Set([ClickTool, UploadTool]);
  },
}));

describe("agentic action policy", () => {
  it("filters model tools and refuses fabricated forbidden calls at execution", async () => {
    const al = new Alumni({ context() {} } as unknown as Page, {
      url: "https://unused.example",
      extraTools: [PrintToPdfTool],
      allowAction: (tool) => tool !== UploadTool && tool !== PrintToPdfTool,
    });
    const tools = Reflect.get(al, "tools") as Record<string, ToolClass>;
    expect(Reflect.get(al.client, "tools")).toBe(tools);
    expect(tools.ClickTool).toBe(ClickTool);
    for (const name of ["UploadTool", "PrintToPdfTool"]) {
      expect(tools[name]).toBeUndefined();
      await expect(
        BaseTool.executeToolCall(
          { name, args: { path: "/host/file" } },
          tools,
          al.driver,
        ),
      ).rejects.toThrow("not found");
    }
  });
});
