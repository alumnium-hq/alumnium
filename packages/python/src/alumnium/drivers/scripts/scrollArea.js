// @ts-check

/// <reference lib="dom" />

// oxlint-disable-next-line no-unused-vars -- evaluated as a function by the drivers
function scrollArea(/** @type {Element} */ element) {
  // Returns the visible part of the area that scrolls the element (its nearest
  // scrollable ancestor, or the viewport): its size, and its center relative to
  // the element and in top-level viewport coordinates. Null if not visible.
  const measure = () => {
    let area = /** @type {Element | null} */ (element);
    while (
      area &&
      area !== document.body &&
      area !== document.documentElement
    ) {
      const { overflowX, overflowY } = getComputedStyle(area);
      const scrolls = (/** @type {string} */ overflow) =>
        /auto|scroll|overlay/.test(overflow);
      if (
        (scrolls(overflowY) && area.scrollHeight > area.clientHeight) ||
        (scrolls(overflowX) && area.scrollWidth > area.clientWidth)
      ) {
        break;
      }
      area = area.parentElement;
    }
    const rect =
      area && area !== document.body && area !== document.documentElement
        ? area.getBoundingClientRect()
        : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const left = Math.max(rect.left, 0);
    const top = Math.max(rect.top, 0);
    const width = Math.min(rect.right, innerWidth) - left;
    const height = Math.min(rect.bottom, innerHeight) - top;
    return width > 0 && height > 0
      ? { x: left + width / 2, y: top + height / 2, width, height }
      : null;
  };

  let visible = measure();
  if (!visible) {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    visible = measure();
  }
  if (!visible) return null;

  // Add the offsets of same-origin parent frames for WebDriver.
  let viewportX = visible.x;
  let viewportY = visible.y;
  for (
    let frameWindow = window;
    frameWindow.frameElement;
    frameWindow = frameWindow.parent
  ) {
    const frame = frameWindow.frameElement;
    const { paddingLeft, paddingTop } =
      frameWindow.parent.getComputedStyle(frame);
    viewportX +=
      frame.getBoundingClientRect().left +
      frame.clientLeft +
      parseFloat(paddingLeft);
    viewportY +=
      frame.getBoundingClientRect().top +
      frame.clientTop +
      parseFloat(paddingTop);
  }

  const origin = element.getBoundingClientRect();
  return {
    offsetX: visible.x - origin.left,
    offsetY: visible.y - origin.top,
    viewportX,
    viewportY,
    width: visible.width,
    height: visible.height,
  };
}
