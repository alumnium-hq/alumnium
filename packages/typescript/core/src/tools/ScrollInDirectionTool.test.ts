import { describe, expect, it, vi } from "vitest";
import { ScrollInDirectionTool } from "./ScrollInDirectionTool.ts";

describe(ScrollInDirectionTool, () => {
  it("scrolls most of the scroll area in the requested direction", () => {
    const area = { width: 1000, height: 500 };

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

  it("delegates to the driver", async () => {
    const driver = { scrollInDirection: vi.fn(async () => undefined) };
    const tool = new ScrollInDirectionTool({ id: 7, direction: "up" });

    await tool.invoke(driver as unknown as ScrollInDirectionTool.Driver);

    expect(driver.scrollInDirection).toHaveBeenCalledWith(7, "up");
  });
});
