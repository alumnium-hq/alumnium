// oxlint-disable-next-line no-unused-expressions -- evaluated as a function by the drivers
(/** @type {Element} */ element, /** @type {number} */ value) => {
  // Computes where to drag an ARIA slider (e.g. <div role="slider">) to set a value.
  // Returns null for native <input> elements, which drivers set directly.
  // Points are relative to the element's top-left corner, so callers can map them
  // to page or element coordinates regardless of scrolling and frames.
  if (element instanceof HTMLInputElement) return null;

  const slider =
    element.closest('[role="slider"]') ||
    element.querySelector('[role="slider"]') ||
    element;
  const number = (/** @type {string} */ name, /** @type {number} */ fallback) => {
    const parsed = parseFloat(slider.getAttribute(name) ?? "");
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const min = number("aria-valuemin", 0);
  const max = number("aria-valuemax", 100);

  // The thumb is the slider itself when it has no focusable child (e.g. a
  // role="slider" handle inside a track), otherwise its focusable descendant.
  const thumb =
    [...slider.querySelectorAll("[tabindex]")].find(
      (candidate) => candidate.getBoundingClientRect().width > 0,
    ) || slider;
  const track =
    thumb === slider && slider.parentElement ? slider.parentElement : slider;

  const origin = element.getBoundingClientRect();
  const thumbRect = thumb.getBoundingClientRect();
  const trackRect = track.getBoundingClientRect();
  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;

  // The thumb center travels between the track edges inset by half its width.
  const start = trackRect.left + thumbRect.width / 2;
  const end = trackRect.right - thumbRect.width / 2;
  const y = thumbRect.top + thumbRect.height / 2 - origin.top;

  return {
    from: { x: thumbRect.left + thumbRect.width / 2 - origin.left, y },
    to: { x: start + ratio * (end - start) - origin.left, y },
    width: origin.width,
    height: origin.height,
  };
}
