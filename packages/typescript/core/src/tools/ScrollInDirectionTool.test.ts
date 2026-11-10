import { describe, expect, it } from "vitest";
import { ScrollInDirectionTool } from "./ScrollInDirectionTool.ts";

describe(ScrollInDirectionTool, () => {
  it("scrolls 80% of the visible area in the requested direction", () => {
    const area = {
      offsetX: 0,
      offsetY: 0,
      viewportX: 0,
      viewportY: 0,
      width: 1000,
      height: 500,
    };

    expect(ScrollInDirectionTool.wheelDelta("up", area)).toEqual({
      deltaX: 0,
      deltaY: -400,
    });
    expect(ScrollInDirectionTool.wheelDelta("down", area)).toEqual({
      deltaX: 0,
      deltaY: 400,
    });
    expect(ScrollInDirectionTool.wheelDelta("left", area)).toEqual({
      deltaX: -800,
      deltaY: 0,
    });
    expect(ScrollInDirectionTool.wheelDelta("right", area)).toEqual({
      deltaX: 800,
      deltaY: 0,
    });
  });
});
