import type { BrowserContext, Page, Request, Response } from "playwright-core";
import { CdpNetworkMonitor } from "./CdpNetworkMonitor.ts";

const RESOURCE_TYPES: Record<string, string> = {
  cspviolationreport: "CSPViolationReport",
  eventsource: "EventSource",
  manifest: "Manifest",
  media: "Media",
  ping: "Ping",
  prefetch: "Prefetch",
  websocket: "WebSocket",
};

/**
 * Supplements CDP with context events for requests that start before a popup's CDP session attaches.
 * Playwright's public CDPSession API cannot address the flattened child sessions created by
 * browser-level auto-attach; attaching another session still races popup startup. Context listeners
 * registered before the popup opens cover that gap and feed the same per-page CdpNetworkMonitor.
 */
export class PlaywrightNetworkMonitor {
  #pages = new Map<Page, CdpNetworkMonitor>();
  #requests = new WeakMap<
    Request,
    { monitor: CdpNetworkMonitor; id: string }
  >();
  #nextId = 1;

  constructor(context: BrowserContext) {
    context.on("request", (request) => this.#requestStarted(request));
    context.on("response", (response) => this.#responseReceived(response));
    context.on("requestfinished", (request) => this.#requestFinished(request));
    context.on("requestfailed", (request) => this.#requestFinished(request));
  }

  forPage(page: Page): CdpNetworkMonitor {
    let monitor = this.#pages.get(page);
    if (!monitor) {
      monitor = new CdpNetworkMonitor();
      this.#pages.set(page, monitor);
      page.on("close", () => {
        this.#pages.get(page)?.clear();
        this.#pages.delete(page);
      });
    }
    return monitor;
  }

  clearSession(page: Page, sessionId: string): void {
    this.#pages.get(page)?.clearSession(sessionId);
  }

  #requestStarted(request: Request): void {
    let page: Page;
    try {
      page = request.frame().page();
    } catch {
      // Popup navigation and service-worker requests may have no page yet.
      return;
    }
    if (page.isClosed()) return;
    const monitor = this.forPage(page);
    const id = `pw:${this.#nextId++}`;
    this.#requests.set(request, { monitor, id });
    monitor.process(
      "Network.requestWillBeSent",
      {
        requestId: id,
        type: RESOURCE_TYPES[request.resourceType()] ?? request.resourceType(),
        request: { url: request.url() },
      },
      "playwright",
    );
  }

  #responseReceived(response: Response): void {
    const state = this.#requests.get(response.request());
    if (!state) return;
    state.monitor.process(
      "Network.responseReceived",
      {
        requestId: state.id,
        response: { headers: response.headers() },
      },
      "playwright",
    );
  }

  #requestFinished(request: Request): void {
    const state = this.#requests.get(request);
    if (!state) return;
    this.#requests.delete(request);
    state.monitor.process(
      "Network.loadingFinished",
      { requestId: state.id },
      "playwright",
    );
  }
}
