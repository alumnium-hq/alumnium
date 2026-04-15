// @ts-check

/// <reference lib="dom" />

(() => {
  /** @typedef {import("../../play/selector.ts").PlaySelector.Type} PlaySelector */
  /** @typedef {import("../../play/selector.ts").PlaySelector.Css} PlaySelectorCss */

  const symbol = Symbol.for("alumnium.findSelector");
  /** @type {any} */ (window)[symbol] ??= function findSelector(element) {
    if (element.id) {
      const selector = buildIdSelector(element.id);
      if (isUniqueSelector(selector)) return selector;
    }

    if (element.role) {
      const selector = buildAttrSelector("role", element.role);
      if (isUniqueSelector(selector)) return selector;
    }

    if (element.classList.length) {
      /** @type {PlaySelectorCss | undefined} */
      let firstUniqueSelector;
      element.classList.forEach((className) => {
        const selector = buildClassSelector(className);
        if (isUniqueSelector(selector) && !firstUniqueSelector) {
          firstUniqueSelector = selector;
        }
      });

      if (firstUniqueSelector) return firstUniqueSelector;
    }

    throw new Error("Unimplemented");
  };

  /**
   * @param {string} value
   * @returns {PlaySelectorCss}
   */
  function buildIdSelector(value) {
    return buildCssSelector(`#${CSS.escape(value)}`);
  }

  /**
   * @param {string} attr
   * @param {string} value
   * @returns {PlaySelectorCss}
   */
  function buildAttrSelector(attr, value) {
    return buildCssSelector(`[${CSS.escape(attr)}="${CSS.escape(value)}"]`);
  }

  /**
   * @param {string | string[]} classNames
   * @returns {PlaySelectorCss}
   */
  function buildClassSelector(classNames) {
    classNames = typeof classNames === "string" ? [classNames] : classNames;
    return buildCssSelector(
      `.${[...classNames].map((className) => CSS.escape(className)).join(".")}`,
    );
  }

  /**
   * @param {string} selector
   * @returns {PlaySelectorCss}
   */
  function buildCssSelector(selector) {
    return { kind: "css", selector };
  }

  /**
   * @param {PlaySelector} selector
   * @returns {boolean}
   */
  function isUniqueSelector(selector) {
    switch (selector.kind) {
      case "css":
        return document.querySelectorAll(selector.selector).length === 1;

      default:
        throw new Error("Unimplemented");
    }
  }
})();
