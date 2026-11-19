import { describe, expect, it } from "vitest";
import { ZoomTool } from "./ZoomTool.ts";

describe(ZoomTool, () => {
  it("wheels up to zoom in and down to zoom out", () => {
    expect(ZoomTool.wheelDelta("in")).toBe(-40);
    expect(ZoomTool.wheelDelta("out")).toBe(40);
  });
});
