import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Alumni } from "alumnium";
import { MaestroSession } from "@alumnium/maestro";
import { McpArtifactsStore } from "../McpArtifactsStore.ts";
import { McpState } from "../McpState.ts";
import { directMcpTools } from "./directMcpTools.ts";
import { fetchAccessibilityTreeMcpTool } from "./fetchAccessibilityTreeMcpTool.ts";

describe("direct scrolling", () => {
  const tool = directMcpTools.find((tool) => tool.name === "scroll")!;
  let al: Alumni;

  beforeEach(() => {
    const session = new MaestroSession({ appId: "com.todo" });
    al = new Alumni(session);
    vi.spyOn(session, "inspectScreen").mockResolvedValue({
      ui_schema: { abbreviations: {}, defaults: {} },
      elements: [
        { b: "[0,0][400,800]", c: [{ rid: "list", b: "[0,100][400,700]" }] },
      ],
    });
    McpState.registerDriver(
      "test-scroll",
      al,
      session,
      new McpArtifactsStore("test-scroll"),
    );
    vi.spyOn(al.driver, "scroll").mockResolvedValue();
    vi.spyOn(al.driver, "scrollTo").mockResolvedValue();
  });

  afterEach(() => {
    McpState.clear();
    vi.restoreAllMocks();
  });

  it("exposes one scroll tool", () => {
    expect(
      directMcpTools
        .filter((tool) => tool.name.startsWith("scroll"))
        .map((tool) => tool.name),
    ).toEqual(["scroll"]);
  });

  it("preserves scroll-to-element calls without a direction", async () => {
    await fetchAccessibilityTreeMcpTool.execute({ id: "test-scroll" });
    const tree = McpState.getDriverState("test-scroll").tree!;
    const output = await tool.execute({ id: "test-scroll", element_id: 2 });
    expect(al.driver.scrollTo).toHaveBeenCalledWith(tree.getRawId(2));
    expect(al.driver.scroll).not.toHaveBeenCalled();
    expect(output).toHaveLength(2);
    expect(McpState.getDriverState("test-scroll").tree).not.toBe(tree);
  });

  it("scrolls the screen without fetching element IDs first and returns a fresh tree", async () => {
    const output = await tool.execute({ id: "test-scroll", direction: "down" });
    expect(al.driver.scroll).toHaveBeenCalledWith(undefined, "down");
    expect(al.driver.scrollTo).not.toHaveBeenCalled();
    expect(output[1]?.text).toContain('resource-id="list"');
    expect(McpState.getDriverState("test-scroll").tree).toBeDefined();
  });

  it("maps the container ID and returns a fresh tree after scrolling", async () => {
    await fetchAccessibilityTreeMcpTool.execute({ id: "test-scroll" });
    const tree = McpState.getDriverState("test-scroll").tree!;
    const output = await tool.execute({
      id: "test-scroll",
      element_id: 2,
      direction: "down",
    });
    expect(al.driver.scroll).toHaveBeenCalledWith(tree.getRawId(2), "down");
    expect(al.driver.scrollTo).not.toHaveBeenCalled();
    expect(output).toHaveLength(2);
    expect(McpState.getDriverState("test-scroll").tree).not.toBe(tree);
  });

  it("requires a tree before scrolling a specific container", async () => {
    await expect(
      tool.execute({ id: "test-scroll", element_id: 1, direction: "down" }),
    ).rejects.toThrow("fetch_accessibility_tree");
    expect(al.driver.scroll).not.toHaveBeenCalled();
  });

  it.each([{ direction: "down" }, { element_id: 2 }])(
    "disables both scroll modes with the ScrollTool setting: %j",
    async (args) => {
      const session = new MaestroSession({ appId: "com.todo" });
      const disabled = new Alumni(session, {
        disabledTools: ["ScrollTool"],
      });
      McpState.registerDriver(
        "test-scroll",
        disabled,
        session,
        new McpArtifactsStore("test-scroll"),
      );
      await expect(
        tool.execute({ id: "test-scroll", ...args }),
      ).rejects.toThrow("disabled");
    },
  );

  it("validates direction values", async () => {
    await expect(
      tool.execute({ id: "test-scroll", direction: "diagonal" }),
    ).rejects.toThrow();
    expect(al.driver.scroll).not.toHaveBeenCalled();
    expect(al.driver.scrollTo).not.toHaveBeenCalled();
  });

  it("rejects calls without an element ID or direction", async () => {
    await expect(tool.execute({ id: "test-scroll" })).rejects.toThrow(
      "requires an element ID or a direction",
    );
    expect(al.driver.scroll).not.toHaveBeenCalled();
    expect(al.driver.scrollTo).not.toHaveBeenCalled();
  });
});
