import { describe } from "vitest";
import {
  type Alumni,
  ExecuteJavascriptTool,
  PanInDirectionTool,
  ZoomTool,
} from "alumnium";
import { baseIt } from "./helpers.ts";

describe("Pan And Zoom", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { isMobile } = result;

      if (isMobile) skip("The test page is a web map");

      return result;
    };
  });

  async function number(al: Alumni, what: string): Promise<number> {
    const value = await al.get(what);
    return Number(String(value).match(/-?\d+/)?.[0]);
  }

  it("pans a map in each direction", async ({ expect, setup }) => {
    const { al, $ } = await setup({ extraTools: [PanInDirectionTool] });

    await $.navigate("pannable_map.html");
    expect(await number(al, "east value of the map center")).toBe(0);
    await al.do("pan the map left");
    expect(await number(al, "east value of the map center")).toBeLessThan(0);
    await al.do("pan the map right");
    expect(await number(al, "east value of the map center")).toBe(0);
    await al.do("pan the map up");
    expect(await number(al, "north value of the map center")).toBeGreaterThan(
      0,
    );
  });

  it("pans a map when asked to drag it", async ({ expect, setup }) => {
    const { al, $ } = await setup({
      extraTools: [ExecuteJavascriptTool, PanInDirectionTool],
    });

    await $.navigate("pannable_map.html");
    await al.do("drag the map about 100 pixels to the right");
    expect(await number(al, "east value of the map center")).toBeLessThan(0);
  });

  it("zooms a map in and out", async ({ expect, setup }) => {
    const { al, $ } = await setup({ extraTools: [ZoomTool] });

    await $.navigate("pannable_map.html");
    await al.do("zoom in the map");
    expect(await number(al, "zoom level of the map")).toBe(11);
    await al.do("zoom out the map");
    await al.do("zoom out the map");
    expect(await number(al, "zoom level of the map")).toBe(9);
  });
});
