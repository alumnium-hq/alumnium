(() => {
  const symbol = Symbol.for("alumnium");
  if (window[symbol]) return;

  const resourceTags = [
    "img",
    "video",
    "audio",
    "embed",
    "object",
    // "script" and "iframe" should be tracked only when "src" is set
    // "link" should be tracked only when rel="stylesheet" and "href" is set
  ];

  const state = {
    pendingRequests: 0,
    pendingUrls: new Set(),
    resources: new Set(),
    activeAt: Date.now(),
    initialLoad: false,
  };

  // Logging settings - can be enabled via options
  let logEnabled = false;

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
  observeResources();
  trackExistingResources();
  hookXHR();
  hookFetch();

  window[symbol] = {
    waitForStability,
    state,
  };

  function waitForStability(options) {
    const idle = options?.idle ?? 500;
    const timeout = options?.timeout ?? 10000;
    logEnabled = options?.log ?? false;

    log("waitForStability started", { idle, timeout });

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let lastLogged = startTime;

      checkStability();

      function checkStability() {
        const now = Date.now();
        const elapsed = now - startTime;

        const noRequests = !state.pendingRequests;
        const noResources = !state.resources.size;
        const idleTime = now - state.activeAt;
        const isIdle = idleTime >= idle;

        // Log state every second
        if (logEnabled && now - lastLogged >= 1000) {
          const resourceInfo = Array.from(state.resources).map(el => {
            const tag = el.tagName?.toLowerCase() || 'unknown';
            const src = el.src || el.href || '';
            return `${tag}:${src.slice(0, 60)}`;
          });
          const pendingUrlsInfo = Array.from(state.pendingUrls).map(url => url.slice(0, 80));

          log("state check", {
            elapsed: `${elapsed}ms`,
            initialLoad: state.initialLoad,
            pendingRequests: state.pendingRequests,
            pendingUrls: pendingUrlsInfo,
            resourcesCount: state.resources.size,
            resources: resourceInfo.slice(0, 5),
            idleTime: `${idleTime}ms`,
            isIdle,
          });
          lastLogged = now;
        }

        if (state.initialLoad && noRequests && noResources && isIdle) {
          log("page stable", { elapsed: `${elapsed}ms` });
          return resolve();
        }

        if (now - startTime >= timeout) {
          const pendingUrlsInfo = Array.from(state.pendingUrls).map(url => url.slice(0, 100));
          const resourceInfo = Array.from(state.resources).map(el => {
            const tag = el.tagName?.toLowerCase() || 'unknown';
            const src = el.src || el.href || '';
            return `${tag}:${src.slice(0, 100)}`;
          });

          log("timeout", {
            pendingRequests: state.pendingRequests,
            pendingUrls: pendingUrlsInfo,
            resourcesCount: state.resources.size,
            resources: resourceInfo,
            initialLoad: state.initialLoad,
          });

          return reject(
            new Error(
              `Timed out waiting for page to stabilize after ${timeout}ms. ` +
              `pendingRequests=${state.pendingRequests}, resources=${state.resources.size}`
            )
          );
        }

        requestAnimationFrame(checkStability);
      }
    });
  }

  //#region Resources

  function trackResource(el) {
    const tag = el.tagName.toLowerCase();
    const src = el.src || el.href || "";

    if ((tag === "video" || tag === "audio") && !src) {
      return;
    }

    let isLoaded =
      el.loading === "lazy" || // lazy loading
      el.complete || // img
      el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA || // media
      (tag === "link" && el.sheet); // CSS

    if (tag === "iframe") {
      const doc = el.contentDocument;
      if (doc) {
        isLoaded = doc.readyState === "complete";
      } else {
        // Cross-origin iframe; assume loaded
        isLoaded = true;
      }
    }

    if (isLoaded) return;

    state.resources.add(el);
    log("resource loading", { tag, src: (src || "(no src)").slice(0, 100), total: state.resources.size });
    updateActiveAt();

    el.addEventListener("load", onDone);
    el.addEventListener("error", onDone);

    function onDone() {
      el.removeEventListener("load", onDone);
      el.removeEventListener("error", onDone);

      state.resources.delete(el);
      log("resource loaded", { tag, src: (src || "(no src)").slice(0, 100), remaining: state.resources.size });
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

  function observeResources() {
    const observer = new MutationObserver((mutationList) => {
      for (const mutation of mutationList) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const tag = node.tagName.toLowerCase();
          const isResource =
            resourceTags.includes(tag) ||
            (tag === "script" && node.src) ||
            (tag === "iframe" && node.src) ||
            (tag === "link" && node.rel === "stylesheet" && node.href);
          if (isResource) trackResource(node);
        }
      }

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
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._alumniumUrl = String(url).slice(0, 200);
      this.addEventListener("loadend", () => {
        state.pendingRequests--;
        state.pendingUrls.delete(this._alumniumUrl);
        log("XHR complete", { url: this._alumniumUrl, pending: state.pendingRequests });
        updateActiveAt();
      });

      return nativeOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      state.pendingRequests++;
      state.pendingUrls.add(this._alumniumUrl);
      log("XHR start", { url: this._alumniumUrl, pending: state.pendingRequests });
      updateActiveAt();

      return nativeSend.apply(this, args);
    };
  }

  function hookFetch() {
    const nativeFetch = window.fetch;

    window.fetch = async function (input, ...args) {
      const url = String(input?.url || input).slice(0, 200);
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
