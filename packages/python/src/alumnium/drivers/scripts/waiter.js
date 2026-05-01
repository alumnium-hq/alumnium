// @ts-check

/// <reference lib="dom" />

(() => {
  /**
   * @typedef {Element | HTMLAnchorElement | HTMLMediaElement | HTMLLinkElement | HTMLIFrameElement} ResourceElement
   */

  /**
   * @typedef {Object} WaitState
   * @property {number} pendingRequests
   * @property {Set<string>} pendingUrls
   * @property {Set<ResourceElement>} resources
   * @property {number} activeAt
   * @property {boolean} initialLoad
   * @property {boolean} mutationIdle
   * @property {ReturnType<typeof setTimeout> | null} mutationDebounceTimer
   */
  const symbol = Symbol.for("alumnium");
  if (/** @type {any} */ (window)[symbol]) return;

  const resourceTags = [
    "img",
    "video",
    "audio",
    "embed",
    "object",
    // "script" and "iframe" should be tracked only when "src" is set
    // "link" should be tracked only when rel="stylesheet" and "href" is set
  ];

  /** @type {WaitState} */
  const state = {
    pendingRequests: 0,
    pendingUrls: new Set(),
    resources: new Set(),
    activeAt: Date.now(),
    initialLoad: false,
    mutationIdle: true,
    mutationDebounceTimer: null,
  };

  // Logging settings - can be enabled via options
  let logEnabled = false;

  /**
   * @param {string} message
   * @param {unknown=} data
   */
  function log(message, data) {
    if (logEnabled) {
      const dataStr = data ? " " + JSON.stringify(data) : "";
      console.debug("[alumnium:waiter] " + message + dataStr);
    }
  }

  function updateActiveAt() {
    state.activeAt = Date.now();
  }

  trackInitialLoad();
  trackExistingResources();
  hookXHR();
  hookFetch();

  /** @type {any} */ (window)[symbol] = {
    waitForStability,
    state,
  };

  /**
   * @typedef {Object} WaitForStabilityOptions
   * @property {number=} idle
   * @property {number=} timeout
   * @property {boolean=} log
   */

  /**
   *
   * @param {WaitForStabilityOptions?} options
   * @returns {Promise<void>}
   */
  function waitForStability(options) {
    const idle = options?.idle ?? 50;
    const timeout = options?.timeout ?? 10000;
    logEnabled = options?.log ?? false;

    // Reset the idle timer to ensure we wait at least the idle period from now
    updateActiveAt();

    log("waitForStability started", { idle, timeout });

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let lastLogged = startTime;
      let domObserverStarted = false;

      checkStability();

      function checkStability() {
        const now = Date.now();
        const elapsed = now - startTime;

        const noRequests = !state.pendingRequests;
        const noResources = !state.resources.size;
        const noMutations = state.mutationIdle;
        const idleTime = now - state.activeAt;
        const isIdle = idleTime >= idle;

        // Log state every second
        if (logEnabled && now - lastLogged >= 1000) {
          const resourceInfo = Array.from(state.resources).map((el) => {
            const tag = el.tagName?.toLowerCase() || "unknown";
            const src =
              ("src" in el && el.src) || ("href" in el && el.href) || "";
            return `${tag}:${src.slice(0, 60)}`;
          });
          const pendingUrlsInfo = Array.from(state.pendingUrls).map((url) =>
            url.slice(0, 80),
          );

          log("state check", {
            elapsed: `${elapsed}ms`,
            initialLoad: state.initialLoad,
            pendingRequests: state.pendingRequests,
            pendingUrls: pendingUrlsInfo,
            resourcesCount: state.resources.size,
            resources: resourceInfo.slice(0, 5),
            mutationIdle: state.mutationIdle,
            idleTime: `${idleTime}ms`,
            isIdle,
          });
          lastLogged = now;
        }

        if (
          state.initialLoad &&
          noRequests &&
          noResources &&
          noMutations &&
          isIdle
        ) {
          if (domObserverStarted) {
            log("page stable", { elapsed: `${elapsed}ms` });
            return resolve(void 0);
          }

          observeDom();
          domObserverStarted = true;
        }

        if (now - startTime >= timeout) {
          const pendingUrlsInfo = Array.from(state.pendingUrls).map((url) =>
            url.slice(0, 100),
          );
          const resourceInfo = Array.from(state.resources).map((el) => {
            const tag = el.tagName?.toLowerCase() || "unknown";
            const src =
              ("src" in el && el.src) || ("href" in el && el.href) || "";
            return `${tag}:${src.slice(0, 100)}`;
          });

          log("timeout", {
            pendingRequests: state.pendingRequests,
            pendingUrls: pendingUrlsInfo,
            resourcesCount: state.resources.size,
            resources: resourceInfo,
            mutationIdle: state.mutationIdle,
            initialLoad: state.initialLoad,
          });

          return reject(
            new Error(
              `Timed out waiting for page to stabilize after ${timeout}ms. ` +
                `pendingRequests=${state.pendingRequests}, resources=${state.resources.size}, mutationIdle=${state.mutationIdle}`,
            ),
          );
        }

        requestAnimationFrame(checkStability);
      }
    });
  }

  //#region Resources

  /**
   * @param {ResourceElement} el
   */
  function trackResource(el) {
    const tag = el.tagName.toLowerCase();
    const src = ("src" in el && el.src) || ("href" in el && el.href) || "";

    if ((tag === "video" || tag === "audio") && !src) {
      return;
    }

    let isLoaded =
      ("loading" in el && el.loading === "lazy") || // lazy loading
      ("complete" in el && !!el.complete) || // img
      ("readyState" in el &&
        el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) || // media
      (tag === "link" && "sheet" in el && !!el.sheet); // CSS

    if (tag === "iframe") {
      const doc = "contentDocument" in el && el.contentDocument;
      if (doc) {
        isLoaded = doc.readyState === "complete";
      } else {
        // Cross-origin iframe; assume loaded
        isLoaded = true;
      }
    }

    if (isLoaded) return;

    state.resources.add(el);
    log("resource loading", {
      tag,
      src: (src || "(no src)").slice(0, 100),
      total: state.resources.size,
    });
    updateActiveAt();

    el.addEventListener("load", onDone);
    el.addEventListener("error", onDone);

    function onDone() {
      el.removeEventListener("load", onDone);
      el.removeEventListener("error", onDone);

      state.resources.delete(el);
      log("resource loaded", {
        tag,
        src: (src || "(no src)").slice(0, 100),
        remaining: state.resources.size,
      });
      updateActiveAt();
    }
  }

  function trackExistingResources() {
    const selector = [
      ...resourceTags,
      // [NOTE] Do not track script tags, as it is not possible to determine if
      // they are loaded or not:
      // "script[src]",
      "iframe[src]",
      'link[rel="stylesheet"][href]',
    ].join(",");
    const resources = document.querySelectorAll(selector);
    resources.forEach(trackResource);
  }

  function observeDom() {
    const mutationDebounceMs = 50;

    // Skip if documentElement is not available (e.g., about:blank)
    if (!(document.documentElement instanceof Node)) {
      return;
    }

    // We start observing mutations after everything is stable, so we need to
    // delay the activeAt to give a chance for any loaded scripts to start
    // work and trigger any potential mutations.
    updateActiveAt();

    const observer = new MutationObserver((mutationList) => {
      if (mutationList.length === 0) return;

      // Track new resources
      for (const mutation of mutationList) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const tag = node.tagName.toLowerCase();
          const isResource =
            resourceTags.includes(tag) ||
            (tag === "script" && "src" in node && !!node.src) ||
            (tag === "iframe" && "src" in node && !!node.src) ||
            (tag === "link" &&
              "rel" in node &&
              node.rel === "stylesheet" &&
              "href" in node &&
              !!node.href);
          if (isResource) trackResource(node);
        }
      }

      // Track mutation idle state with debouncing
      if (state.mutationIdle) {
        state.mutationIdle = false;
        log("DOM mutations started");
      }

      if (state.mutationDebounceTimer) {
        clearTimeout(state.mutationDebounceTimer);
      }

      state.mutationDebounceTimer = setTimeout(() => {
        state.mutationIdle = true;
        state.mutationDebounceTimer = null;
        log("DOM mutations settled");
        updateActiveAt();
      }, mutationDebounceMs);

      updateActiveAt();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function trackInitialLoad() {
    if (document.readyState === "complete") {
      state.initialLoad = true;
    } else {
      window.addEventListener("load", () => {
        state.initialLoad = true;
        updateActiveAt();
      });
    }
  }

  //#endregion

  //#region Requests

  function hookXHR() {
    // oxlint-disable-next-line typescript/unbound-method
    const nativeOpen = XMLHttpRequest.prototype.open;
    // oxlint-disable-next-line typescript/unbound-method
    const nativeSend = XMLHttpRequest.prototype.send;

    /**
     * @typedef {{ _alumniumUrl?: string }} XhrExtra
     */

    /**
     * @this {XMLHttpRequest & XhrExtra}
     * @param {string} method
     * @param {string | URL} url
     * @param {...any} rest
     */
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._alumniumUrl = String(url).slice(0, 200);
      this.addEventListener("loadend", () => {
        state.pendingRequests--;
        state.pendingUrls.delete(this._alumniumUrl || "");
        log("XHR complete", {
          url: this._alumniumUrl,
          pending: state.pendingRequests,
        });
        updateActiveAt();
      });

      // @ts-expect-error -- It is tricky to type
      return nativeOpen(method, url, ...rest);
    };

    /**
     * @this  {XMLHttpRequest & XhrExtra}
     * @param {Document | XMLHttpRequestBodyInit | null} body
     */
    XMLHttpRequest.prototype.send = function (body) {
      state.pendingRequests++;
      state.pendingUrls.add(this._alumniumUrl || "");
      log("XHR start", {
        url: this._alumniumUrl,
        pending: state.pendingRequests,
      });
      updateActiveAt();

      return nativeSend.call(this, body);
    };
  }

  function hookFetch() {
    const nativeFetch = window.fetch;

    /**
     * @param {RequestInfo | URL} input
     * @returns {string}
     */
    function getFetchUrl(input) {
      if (typeof input === "string") return input;
      if (input instanceof URL) return input.href;
      return input.url;
    }

    window.fetch = async function (input, ...args) {
      const url = getFetchUrl(input).slice(0, 200);
      state.pendingRequests++;
      state.pendingUrls.add(url);
      log("fetch start", { url, pending: state.pendingRequests });
      updateActiveAt();

      try {
        return await nativeFetch(input, ...args);
      } finally {
        state.pendingRequests--;
        state.pendingUrls.delete(url);
        log("fetch complete", { url, pending: state.pendingRequests });
        updateActiveAt();
      }
    };
  }

  //#endregion
})();
