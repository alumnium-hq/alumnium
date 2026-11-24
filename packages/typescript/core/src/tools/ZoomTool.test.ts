import { describe, expect, it } from "vitest";
import { ZoomTool } from "./ZoomTool.ts";

describe(ZoomTool, () => {
  it("wheels up to zoom in and down to zoom out", () => {
    expect(ZoomTool.wheelDelta("in")).toBe(-40);
    expect(ZoomTool.wheelDelta("out")).toBe(40);
  });

  it("corrects the burst when the page gets scaled wheel distances", () => {
    expect(ZoomTool.remainingWheelDeltas("in")).toEqual(Array(4).fill(-40));
    expect(ZoomTool.remainingWheelDeltas("in", -40)).toEqual(
      Array(4).fill(-40),
    );
    // The page got twice the distance: 80 + 4 * 15 * 2 is the 200 of a burst.
    expect(ZoomTool.remainingWheelDeltas("in", -80)).toEqual(
      Array(4).fill(-15),
    );
    expect(ZoomTool.remainingWheelDeltas("out", 20)).toEqual(Array(4).fill(90));
  });
});
