// @ts-check

/// <reference lib="dom" />

// oxlint-disable-next-line no-unused-vars -- evaluated as a function by the drivers
function slider(
  /** @type {Element} */ element,
  /** @type {number} */ value,
  /** @type {boolean} */ reset,
) {
  // Works out the next step to set an ARIA slider (e.g. <div role="slider">) to a
  // value. Drivers call it in a loop, performing each returned step, until it
  // returns { action: "done" }. Pass reset = true on the first call. Steps are:
  //
  // - { action: "down", x, y }: move the pointer to the point and press it
  // - { action: "move", x, y }: move the pressed pointer to the point
  // - { action: "up" }: release the pointer
  // - { action: "done", value }
  //
  // Sliders differ in how values map to pixels (thumbs inset or not, stepped or
  // non-linear scales, bounds that depend on other thumbs), so the first move
  // is only an estimate. While the pointer is still pressed, each call reads
  // aria-valuenow and interpolates between observed positions to move closer.
  // Pages often commit a value on release (e.g. by reloading filtered results),
  // so this keeps it to a single drag when the slider updates while dragging.
  // Values between pixels may be unreachable, so it releases at the closest one.
  //
  // Returns null for native <input> elements, which drivers set directly.
  // Points are relative to the element's top-left corner, so callers can map them
  // to page or element coordinates regardless of scrolling and frames. Steps
  // with points also include the element's width and height.
  if (element instanceof HTMLInputElement) return null;

  const MAX_DRAGS = 3;
  const MAX_MOVES = 10;

  const slider =
    element.closest('[role="slider"]') ||
    element.querySelector('[role="slider"]') ||
    element;
  const number = (
    /** @type {string} */ name,
    /** @type {number} */ fallback,
  ) => {
    const parsed = parseFloat(slider.getAttribute(name) ?? "");
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const min = number("aria-valuemin", 0);
  const max = number("aria-valuemax", 100);
  const now = number("aria-valuenow", NaN);
  const current = Number.isFinite(now) ? now : null;

  // The thumb is the slider itself when it has no focusable child (e.g. a
  // role="slider" handle inside a track), otherwise its focusable descendant.
  const thumb = /** @type {HTMLElement} */ (
    [...slider.querySelectorAll("[tabindex]")].find(
      (candidate) => candidate.getBoundingClientRect().width > 0,
    ) || slider
  );
  const thumbRect = thumb.getBoundingClientRect();
  const center = thumbRect.left + thumbRect.width / 2;

  // The track is the closest untransformed ancestor that is wider than the thumb
  // and spans it. Transformed ancestors may move along with the thumb (e.g. the
  // full-width noUi-origin wrapper of noUiSlider handles).
  const findTrack = () => {
    if (thumb !== slider) return slider;
    let fallback;
    for (let node = slider.parentElement; node; node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (
        rect.width >= thumbRect.width * 2 &&
        rect.left <= center + thumbRect.width / 2 &&
        rect.right >= center - thumbRect.width / 2
      ) {
        if (getComputedStyle(node).transform === "none") return node;
        fallback ??= node;
      }
    }
    return fallback || slider.parentElement || slider;
  };
  const trackRect = findTrack().getBoundingClientRect();
  const origin = element.getBoundingClientRect();

  const key = Symbol.for("alumnium:slider");
  const store = /** @type {any} */ (window);
  /** @type {WeakMap<Element, any>} */
  const states = (store[key] ??= new WeakMap());
  if (reset) states.delete(slider);
  if (!states.has(slider))
    states.set(slider, { phase: "idle", samples: [], drags: 0 });
  const state = states.get(slider);

  // Thumbs of range sliders may overlap, so grab the thumb where it is on top
  // rather than always at its center.
  const middle = thumbRect.top + thumbRect.height / 2;
  const grab = () => {
    for (const shift of [0, -0.25, 0.25, -0.4, 0.4]) {
      const offset = shift * thumbRect.width;
      const hit = element.ownerDocument.elementFromPoint(
        center + offset,
        middle,
      );
      if (hit && (thumb.contains(hit) || slider.contains(hit))) return offset;
    }
    return null;
  };

  // Points track the thumb center, while the pointer keeps its grab offset.
  const pointer = (/** @type {string} */ action, /** @type {number} */ x) => {
    const clamped = Math.min(trackRect.right, Math.max(trackRect.left, x));
    state.x = clamped;
    return {
      action,
      x: clamped + state.offset - origin.left,
      y: middle - origin.top,
      width: origin.width,
      height: origin.height,
    };
  };
  const down = (/** @type {number} */ target, /** @type {number} */ offset) => {
    state.phase = "dragging";
    state.offset = offset;
    state.drags++;
    state.moves = 0;
    state.target = target;
    state.start = current;
    return pointer("down", center);
  };
  const move = (/** @type {number} */ x) => {
    state.moves++;
    return pointer("move", x);
  };
  const up = () => {
    state.phase = "released";
    return { action: "up" };
  };
  const done = () => {
    states.delete(slider);
    return { action: "done", value: current };
  };

  // Assume a linear scale where the thumb center travels between the track
  // edges inset by half its width.
  const estimate = () => {
    const ratio =
      max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
    const start = trackRect.left + thumbRect.width / 2;
    const end = trackRect.right - thumbRect.width / 2;
    return start + ratio * (end - start);
  };

  // Interpolates between the closest observed positions around the value, and
  // bisects when the last two landed on the same side (where interpolation
  // alone converges slowly on non-linear scales). Extrapolates from the two
  // closest positions when none is on the other side yet.
  const interpolate = () => {
    /** @type {{ x: number, value: number }[]} */
    const samples = [];
    for (const sample of [...state.samples].reverse())
      if (!samples.some((other) => other.value === sample.value))
        samples.push(sample);

    const line = (
      /** @type {{ x: number, value: number }} */ a,
      /** @type {{ x: number, value: number }} */ b,
    ) => a.x + ((value - a.value) * (b.x - a.x)) / (b.value - a.value);

    const below = samples
      .filter((sample) => sample.value < value)
      .sort((a, b) => b.value - a.value)[0];
    const above = samples
      .filter((sample) => sample.value > value)
      .sort((a, b) => a.value - b.value)[0];

    let x;
    if (below && above) {
      const [last, previous] = state.samples.slice(-2).reverse();
      const stalled =
        previous &&
        Math.sign(last.value - value) === Math.sign(previous.value - value);
      x = stalled ? (below.x + above.x) / 2 : line(below, above);
    } else {
      const [a, b] = samples.sort(
        (a, b) => Math.abs(a.value - value) - Math.abs(b.value - value),
      );
      if (!a || !b) return null;

      x = line(a, b);
    }

    return Number.isFinite(x) ? x : null;
  };

  const closer = (/** @type {number | null} */ x) =>
    x !== null && Math.abs(x - state.x) >= 0.5 ? x : null;
  const distance = (/** @type {number} */ other) => Math.abs(other - value);

  // Before releasing, return to the closest value seen while dragging, as a
  // move between whole pixels may overshoot it (e.g. 19 → 22 when aiming at 20).
  const settle = () => {
    const best = state.samples.reduce(
      (/** @type {{ x: number, value: number } | null} */ best, sample) =>
        !best || distance(sample.value) < distance(best.value) ? sample : best,
      null,
    );
    if (
      current !== null &&
      state.live &&
      best &&
      distance(best.value) < distance(current) &&
      closer(best.x) !== null
    ) {
      state.settled = true;
      return move(best.x);
    }
    return up();
  };

  const reached =
    current !== null &&
    Math.abs(current - value) <= 1e-9 * Math.max(1, Math.abs(value));

  if (state.phase === "idle") {
    if (reached) return done();

    if (current !== null) state.samples.push({ x: center, value: current });
    const offset = grab();
    if (offset !== null) return down(estimate(), offset);
  }

  if (state.phase === "dragging") {
    if (state.moves === 0) return move(state.target);
    if (state.settled) return up();
    // Without aria-valuenow there is nothing to correct the estimate with.
    if (current === null) return up();
    // Values only count once the slider is seen updating while dragging.
    if (current !== state.start) state.live = true;
    if (state.live) state.samples.push({ x: state.x, value: current });
    if (reached || !state.live || state.moves >= MAX_MOVES) return settle();
    const x = closer(interpolate());
    return x === null ? settle() : move(x);
  }

  if (state.phase === "released") {
    if (current === null || reached) return done();
    // Sliders that only update on release need another drag to correct it.
    if (!state.live) {
      state.samples.push({ x: state.x, value: current });
      state.x = center;
      const x = state.drags < MAX_DRAGS ? closer(interpolate()) : null;
      const offset = x === null ? null : grab();
      if (x !== null && offset !== null) return down(x, offset);
    }
  }

  return done();
}
