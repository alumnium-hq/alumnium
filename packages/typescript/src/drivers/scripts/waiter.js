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
    resources: new Set(),
    activeAt: Date.now(),
    initialLoad: false,
  };

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
    const log = options?.log ?? false;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let lastLogged = startTime;

      checkStability();

      function checkStability() {
        const now = Date.now();

        const noRequests = !state.pendingRequests;
        const noResources = !state.resources.size;
        const isIdle = now - state.activeAt >= idle;

        if (log && now - lastLogged >= 1000) {
          console.log("Alumnium waiter state:", state);
          lastLogged = now;
        }

        if (state.initialLoad && noRequests && noResources && isIdle)
          return resolve();

        if (now - startTime >= timeout)
          return reject(
            new Error(
              `Timed out waiting for page to stabilize after ${timeout}ms.`
            )
          );

        requestAnimationFrame(checkStability);
      }
    });
  }

  //#region Resources

  function trackResource(el) {
    const tag = el.tagName.toLowerCase();

    const isLoaded =
      el.loading === "lazy" || // lazy loading
      el.complete || // img
      el.readyState === "complete" || // media
      (tag === "link" && el.sheet); // CSS
    if (isLoaded) return;

    state.resources.add(el);
    updateActiveAt();

    el.addEventListener("load", onDone);
    el.addEventListener("error", onDone);

    function onDone() {
      el.removeEventListener("load", onDone);
      el.removeEventListener("error", onDone);

      state.resources.delete(el);
      updateActiveAt();
    }
  }

  function trackExistingResources() {
    const selector = [
      ...resourceTags,
      // [NOTE] Do not track script and iframe tags, as it is not possible to determine if
      // they are is loaded or not:
      // "iframe[src]",
      // "script[src]",
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

    XMLHttpRequest.prototype.open = function (...args) {
      this.addEventListener("loadend", () => {
        state.pendingRequests--;
        updateActiveAt();
      });

      return nativeOpen.apply(this, args);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      state.pendingRequests++;
      updateActiveAt();

      return nativeSend.apply(this, args);
    };
  }

  function hookFetch() {
    const nativeFetch = window.fetch;

    window.fetch = async function (...args) {
      state.pendingRequests++;
      updateActiveAt();

      try {
        return await nativeFetch(...args);
      } finally {
        state.pendingRequests--;
        updateActiveAt();
      }
    };
  }

  //#endregion
})();
