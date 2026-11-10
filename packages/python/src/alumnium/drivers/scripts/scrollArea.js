// @ts-check

/// <reference lib="dom" />

// oxlint-disable-next-line no-unused-vars -- evaluated as a function by the drivers
function scrollArea(/** @type {Element} */ element) {
  // Finds the area that scrolls the element: its nearest scrollable ancestor
  // (or itself), or the viewport when only the page scrolls. Returns the
  // visible size of that area and its visible center as an offset from the
  // element's top-left corner, or null when the area is off screen. Drivers
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

  const origin = element.getBoundingClientRect();
  return {
    offsetX: left + width / 2 - origin.left,
    offsetY: top + height / 2 - origin.top,
    width,
    height,
  };
}
