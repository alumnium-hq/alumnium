// @ts-check

/// <reference lib="dom" />

(() => {
  const MAX_TRACKED_TIMEOUT_MS = 1000;
  const symbol = Symbol.for("alumnium");
  if (/** @type {any} */ (window)[symbol]) return;

  /**
   * @typedef {Object} TimeoutState
   * @property {(...args: any[]) => any} handler
   * @property {string | null} callsite
   * @property {boolean} blocking
   */

  let lastMutationAt = Date.now();
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  /** @type {Map<number, TimeoutState>} */
  const timeouts = new Map();
  /** @type {TimeoutState | null} */
  let activeTimeout = null;
  const observer = new MutationObserver((mutations) => {
    if (mutations.length) lastMutationAt = Date.now();
  });

  observeDocument();
  trackTimeouts();

  /** @type {any} */ (window)[symbol] = {
    snapshot() {
      return {
        lastMutationAt,
        now: Date.now(),
        pendingTimeouts: Array.from(timeouts.values()).filter(
          (timeout) => timeout.blocking,
        ).length,
        readyState: document.readyState,
      };
    },
  };

  function observeDocument() {
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });
      return;
    }

    const documentObserver = new MutationObserver(() => {
      if (!document.documentElement) return;
      documentObserver.disconnect();
      lastMutationAt = Date.now();
      observeDocument();
    });
    documentObserver.observe(document, { childList: true });
  }

  function trackTimeouts() {
    window.setTimeout = function (handler, delay = 0, ...args) {
      if (typeof handler !== "function") {
        return nativeSetTimeout(handler, delay, ...args);
      }

      const callback = /** @type {(...args: any[]) => any} */ (handler);
      const callsite = timeoutCallsite();
      const recursive =
        activeTimeout !== null &&
        (callback === activeTimeout.handler ||
          (callsite !== null && callsite === activeTimeout.callsite));
      /** @type {TimeoutState} */
      const state = {
        handler: callback,
        callsite,
        blocking: delay <= MAX_TRACKED_TIMEOUT_MS && !recursive,
      };
      let timeoutId = 0;
      timeoutId = nativeSetTimeout(
        /**
         * @param {...any} callbackArgs
         */
        function (...callbackArgs) {
          timeouts.delete(timeoutId);
          const previousTimeout = activeTimeout;
          activeTimeout = state;
          try {
            return callback.apply(window, callbackArgs);
          } finally {
            activeTimeout = previousTimeout;
          }
        },
        delay,
        ...args,
      );
      timeouts.set(timeoutId, state);
      return timeoutId;
    };

    window.clearTimeout = function (timeoutId) {
      if (timeoutId !== undefined) timeouts.delete(timeoutId);
      nativeClearTimeout(timeoutId);
    };
  }

  function timeoutCallsite() {
    return new Error().stack?.split("\n").slice(3).find(Boolean)?.trim() ?? null;
  }
})();
