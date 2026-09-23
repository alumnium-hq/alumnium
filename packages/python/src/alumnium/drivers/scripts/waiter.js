// @ts-check

/// <reference lib="dom" />

(() => {
  const FRAME_REQUESTS_MESSAGE = "alumnium:requests";
  const MAX_TRACKED_BODY_BYTES = 1024 * 1024; // 1MB
  const MAX_TRACKED_TIMEOUT_MS = 1000;
  const RESOURCE_ATTRIBUTES = new Set(["src", "srcset", "href"]);
  const STREAMING_CONTENT_TYPES = new Set([
    "text/event-stream",
    "multipart/x-mixed-replace",
  ]);

  const symbol = Symbol.for("alumnium");
  if (/** @type {any} */ (window)[symbol]) return;

  /**
   * @typedef {Object} TimeoutState
   * @property {(...args: any[]) => any} handler
   * @property {string | null} callsite
   * @property {boolean} blocking
   */

  /**
   * @typedef {Object} RequestsState
   * @property {string[]} urls
   * @property {number} lastRequestAt
   */

  let lastMutationAt = Date.now();
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  /** @type {Map<number, TimeoutState>} */
  const timeouts = new Map();
  /** @type {TimeoutState | null} */
  let activeTimeout = null;
  /** @type {Map<number, string>} */
  const requests = new Map();
  let nextRequestId = 1;
  let lastRequestAt = 0;
  /** @type {Map<Window, RequestsState>} */
  const frameRequests = new Map();
  /** @type {Map<Element, string>} */
  const resources = new Map();
  /** @type {WeakSet<HTMLScriptElement>} */
  const seenScripts = new WeakSet();
  const observer = new MutationObserver((mutations) => {
    if (mutations.length) lastMutationAt = Date.now();
    trackResources(mutations);
  });

  observeDocument();
  trackTimeouts();
  trackFetch();
  trackXhr();
  trackFrameRequests();

  /** @type {any} */ (window)[symbol] = {
    snapshot() {
      const state = requestsState();
      return {
        lastMutationAt,
        lastRequestAt: state.lastRequestAt,
        pendingRequests: state.urls,
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
      trackResource(document.documentElement, true);
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

  function trackFetch() {
    const nativeFetch = window.fetch;
    if (typeof nativeFetch !== "function") return;
    window.fetch = function (input, init) {
      const finish = requestStarted(requestUrl(input));
      try {
        const response = nativeFetch.call(this, input, init);
        response.then((value) => finishWithBody(value, finish), finish);
        return response;
      } catch (error) {
        finish();
        throw error;
      }
    };
  }

  /**
   * Fetch resolves once headers arrive, but the page usually renders only after
   * reading the body, which can arrive noticeably later, so wait for it too.
   * @param {Response} response
   * @param {() => void} finish
   */
  function finishWithBody(response, finish) {
    const contentType = response.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase();
    if (
      !response.body ||
      (contentType && STREAMING_CONTENT_TYPES.has(contentType))
    ) {
      finish();
      return;
    }
    /** @type {ReadableStreamDefaultReader<Uint8Array>} */
    let reader;
    try {
      reader =
        /** @type {ReadableStream<Uint8Array>} */ (
          response.clone().body
        ).getReader();
    } catch {
      finish();
      return;
    }
    // Discard chunks as they arrive and stop tracking large downloads, so the
    // copy never holds more than the cap in memory.
    let received = 0;
    /** @returns {Promise<void>} */
    const read = () =>
      reader.read().then(({ done, value }) => {
        if (done) return finish();
        received += value.byteLength;
        if (received > MAX_TRACKED_BODY_BYTES) {
          reader.cancel().catch(() => undefined);
          return finish();
        }
        return read();
      });
    read().catch(finish);
  }

  function trackXhr() {
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    /** @type {WeakMap<XMLHttpRequest, string>} */
    const urls = new WeakMap();
    /** @type {any} */ (XMLHttpRequest.prototype).open = function (
      /** @type {string} */ method,
      /** @type {string | URL} */ url,
      /** @type {any[]} */ ...args
    ) {
      urls.set(this, String(url));
      return Reflect.apply(nativeOpen, this, [method, url, ...args]);
    };
    XMLHttpRequest.prototype.send = function (body) {
      const finish = requestStarted(urls.get(this) ?? "");
      this.addEventListener("loadend", finish, { once: true });
      try {
        return nativeSend.call(this, body);
      } catch (error) {
        finish();
        throw error;
      }
    };
  }

  /**
   * Elements load their resources without fetch or XHR, e.g. code chunks that
   * client-side routers load by inserting script tags.
   * @param {MutationRecord[]} mutations
   */
  function trackResources(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        if (
          RESOURCE_ATTRIBUTES.has(mutation.attributeName ?? "") &&
          !(mutation.target instanceof HTMLScriptElement)
        ) {
          trackResource(mutation.target, false);
        }
      } else {
        mutation.addedNodes.forEach((node) => trackResource(node, false));
      }
    }
  }

  /**
   * @param {Node} node
   * @param {boolean} initial Whether the page might have loaded the resource
   *   before the waiter was installed, so it would never report loading it.
   */
  function trackResource(node, initial) {
    if (!(node instanceof Element)) return;
    const url = loadingResourceUrl(node, initial);
    if (url && resources.get(node) !== url) {
      resources.set(node, url);
      lastRequestAt = Date.now();
      const finish = () => {
        if (resources.get(node) !== url) return;
        resources.delete(node);
        lastRequestAt = Date.now();
        reportRequests();
      };
      node.addEventListener("load", finish, { once: true });
      node.addEventListener("error", finish, { once: true });
      reportRequests();
    }
    node
      .querySelectorAll("script, link[href], img, iframe")
      .forEach((child) => {
        if (child !== node) trackResource(child, initial);
      });
  }

  /**
   * @param {Element} element
   * @param {boolean} initial
   * @returns {string | null}
   */
  function loadingResourceUrl(element, initial) {
    if (element instanceof HTMLScriptElement) {
      // A script loads only when first inserted, never when moved.
      if (seenScripts.has(element)) return null;
      seenScripts.add(element);
      if (initial || !element.src || !isExecutableScript(element)) return null;
      return element.src;
    }
    if (element instanceof HTMLLinkElement) {
      const rel = element.rel.toLowerCase();
      const loads =
        rel === "stylesheet" || rel === "preload" || rel === "modulepreload";
      return loads && element.href && !element.sheet ? element.href : null;
    }
    if (element instanceof HTMLImageElement) {
      // Lazy images outside the viewport do not load until scrolled to.
      if (element.loading === "lazy" || element.complete) return null;
      return element.currentSrc || element.src || null;
    }
    if (element instanceof HTMLIFrameElement) {
      return !initial && element.src && !element.src.startsWith("about:")
        ? element.src
        : null;
    }
    return null;
  }

  /**
   * Browsers never fetch scripts they would not execute, so these never load.
   * @param {HTMLScriptElement} script
   */
  function isExecutableScript(script) {
    if (script.noModule) return false;
    const type = script.type.trim().toLowerCase();
    return (
      !type ||
      type === "module" ||
      type.endsWith("javascript") ||
      type.endsWith("ecmascript")
    );
  }

  /**
   * @param {string} url
   * @returns {() => void}
   */
  function requestStarted(url) {
    const id = nextRequestId++;
    requests.set(id, url);
    lastRequestAt = Date.now();
    reportRequests();
    return () => {
      if (!requests.delete(id)) return;
      lastRequestAt = Date.now();
      reportRequests();
    };
  }

  /**
   * @param {RequestInfo | URL} input
   */
  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input?.url ?? "";
  }

  // Frames report their requests up to the top document, which works across
  // origins and processes, so the top frame snapshot covers the whole page.
  function trackFrameRequests() {
    window.addEventListener(
      "message",
      (event) => {
        const state = event.data?.[FRAME_REQUESTS_MESSAGE];
        if (!state || !event.source) return;
        event.stopImmediatePropagation();
        frameRequests.set(/** @type {Window} */ (event.source), state);
        reportRequests();
      },
      true,
    );
    reportRequests();
  }

  function reportRequests() {
    if (window.parent === window) return;
    window.parent.postMessage(
      { [FRAME_REQUESTS_MESSAGE]: requestsState() },
      "*",
    );
  }

  /**
   * @returns {RequestsState}
   */
  function requestsState() {
    const urls = Array.from(requests.values());
    for (const [element, url] of resources) {
      if (element.isConnected) {
        urls.push(url);
      } else {
        resources.delete(element);
      }
    }
    let latest = lastRequestAt;
    for (const [frame, state] of frameRequests) {
      if (frame.closed) {
        frameRequests.delete(frame);
        continue;
      }
      urls.push(...state.urls);
      latest = Math.max(latest, state.lastRequestAt);
    }
    return { urls, lastRequestAt: latest };
  }

  function timeoutCallsite() {
    return (
      new Error().stack?.split("\n").slice(3).find(Boolean)?.trim() ?? null
    );
  }
})();
