// @ts-check

/// <reference lib="dom" />

// oxlint-disable-next-line no-unused-vars -- evaluated as a function by the drivers
function scrollArea(/** @type {Element} */ element) {
  // Finds the area that scrolls the element: its nearest scrollable ancestor
  // (or itself), or the viewport when only the page scrolls. Returns the
  // visible size of that area and its visible center, both as an offset from
  // the element's top-left corner (for Playwright, which positions the mouse
  // relative to the top-level page itself) and in top-level viewport
  // coordinates (for WebDriver), or null when the area is off screen. Drivers
  // wheel over that point by most of that size, so content is never skipped
  // and an element that has scrolled away still scrolls its area.
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isPage = (/** @type {Element | null} */ node) =>
    !node ||
    node === element.ownerDocument.body ||
    node === element.ownerDocument.documentElement;
  const scrolls = (
    /** @type {string} */ overflow,
    /** @type {number} */ size,
    /** @type {number} */ clientSize,
  ) => /(auto|scroll|overlay)/.test(overflow) && size > clientSize;

  /** @type {Element | null} */
  let area = element;
  while (area && !isPage(area)) {
    const style = window.getComputedStyle(area);
    if (
      scrolls(style.overflowY, area.scrollHeight, area.clientHeight) ||
      scrolls(style.overflowX, area.scrollWidth, area.clientWidth)
    ) {
      break;
    }
    area = area.parentElement;
  }

  const rect =
    !area || isPage(area)
      ? { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight }
      : area.getBoundingClientRect();
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const width = Math.min(rect.right, viewportWidth) - left;
  const height = Math.min(rect.bottom, viewportHeight) - top;
  if (width <= 0 || height <= 0) return null;

  const centerX = left + width / 2;
  const centerY = top + height / 2;

  // WebDriver viewport coordinates are relative to the top-level page, while
  // the rects above are relative to the element's frame, so add the content
  // box offset of every parent frame. Cross-origin parents have no
  // frameElement, so offsets stop at the first one.
  let viewportX = centerX;
  let viewportY = centerY;
  /** @type {Window} */
  let frameWindow = window;
  while (frameWindow.frameElement && frameWindow.parent !== frameWindow) {
    const frame = frameWindow.frameElement;
    const frameRect = frame.getBoundingClientRect();
    const frameStyle = frameWindow.parent.getComputedStyle(frame);
    viewportX +=
      frameRect.left + frame.clientLeft + parseFloat(frameStyle.paddingLeft);
    viewportY +=
      frameRect.top + frame.clientTop + parseFloat(frameStyle.paddingTop);
    frameWindow = frameWindow.parent;
  }

  const origin = element.getBoundingClientRect();
  return {
    offsetX: centerX - origin.left,
    offsetY: centerY - origin.top,
    viewportX,
    viewportY,
    width,
    height,
  };
}
