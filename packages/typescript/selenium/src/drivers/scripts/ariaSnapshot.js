// oxlint-disable-next-line no-unused-expressions -- evaluated as a function by the drivers
() => {
  // Takes an ARIA snapshot of the page with acquiescence, which drivers preload
  // into their sandbox. Returns null when acquiescence isn't loaded yet, otherwise
  // the snapshot as JSON and the elements of its refs, in the same order.
  if (!globalThis.Acquiescence) return null;
  const generator = new globalThis.Acquiescence.AriaSnapshotGenerator();

  // Acquiescence gives elements like <div> no role and leaves them out, so
  // clickable ones without a role, e.g. <div onclick>, can't be addressed.
  // Like Google Chrome, map them to "generic" per HTML-AAM and keep generic nodes.
  // https://www.w3.org/TR/html-aam-1.0/#el-div
  const genericElements =
    "b, bdi, bdo, data, div, i, pre, q, samp, small, span, u";
  const { ariaUtilities } = generator;
  const getAriaRole = ariaUtilities.getAriaRole.bind(ariaUtilities);
  ariaUtilities.getAriaRole = (/** @type {Element} */ element) =>
    getAriaRole(element) ??
    (element.matches(genericElements) ? "generic" : null);
  generator.omittedRoles = generator.omittedRoles.filter(
    (/** @type {string} */ role) => role !== "generic",
  );

  const { root, references } = generator.generate(
    document.body ?? document.documentElement,
  );
  root.name = document.title;
  root.url = location.href;

  // Values the snapshot leaves out, such as the files chosen in file inputs.
  /** @type {Record<string, string>} */
  const values = {};
  for (const { ref, element } of references) {
    if (
      element instanceof HTMLInputElement &&
      element.type === "file" &&
      element.files?.length
    ) {
      values[ref] = Array.from(element.files, (file) => file.name).join(", ");
    }
  }

  return [
    JSON.stringify({
      root,
      refs: references.map(
        (/** @type {{ ref: string }} */ reference) => reference.ref,
      ),
      values,
    }),
    references.map(
      (/** @type {{ element: Element }} */ reference) => reference.element,
    ),
  ];
};
