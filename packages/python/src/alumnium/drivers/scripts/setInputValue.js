// @ts-check

/// <reference lib="dom" />

// oxlint-disable-next-line no-unused-vars -- evaluated as a function by the drivers
function setInputValue(
  /** @type {HTMLInputElement} */ element,
  /** @type {string} */ value,
) {
  // Sets a native input's value the way user input does, so frameworks that track
  // it (e.g. React) see the change. The setter is taken from the prototype chain
  // because such frameworks shadow `value` on the element itself.
  let descriptor;
  for (
    let prototype = Object.getPrototypeOf(element);
    prototype && !descriptor?.set;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  }

  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  // Pages may replace the global Event constructor (e.g. with their own event
  // emitter class), so events are created through the document instead.
  for (const type of ["input", "change"]) {
    const event = element.ownerDocument.createEvent("Event");
    event.initEvent(type, true, false);
    element.dispatchEvent(event);
  }
}
