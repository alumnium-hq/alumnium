import type { Driver } from "./Driver.ts";

export function scrollPoints(
  frame: { x: number; y: number; width: number; height: number },
  direction: Driver.ScrollDirection,
) {
  if (frame.width <= 0 || frame.height <= 0)
    throw new Error("Scroll container has no visible area");

  const center = {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  };
  const horizontal = direction === "left" || direction === "right";
  const axis = horizontal ? "x" : "y";
  const distance = (horizontal ? frame.width : frame.height) / 4;
  const sign = direction === "down" || direction === "right" ? 1 : -1;
  return {
    start: { ...center, [axis]: center[axis] + distance * sign },
    end: { ...center, [axis]: center[axis] - distance * sign },
  };
}
