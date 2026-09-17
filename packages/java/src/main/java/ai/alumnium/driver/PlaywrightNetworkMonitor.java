package ai.alumnium.driver;

import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Request;
import com.microsoft.playwright.Response;
import java.util.IdentityHashMap;
import java.util.Map;

/**
 * Supplements CDP with context events for requests that start before a popup's CDP session
 * attaches. Playwright's public CDPSession API cannot address the flattened child sessions created
 * by browser-level auto-attach; attaching another session still races popup startup. Context
 * listeners registered before the popup opens cover that gap and feed the same per-page
 * CdpNetworkMonitor.
 */
final class PlaywrightNetworkMonitor {
  private final Map<Page, CdpNetworkMonitor> pageNetworkMonitors = new IdentityHashMap<>();
  private final Map<Request, String> playwrightRequestIds = new IdentityHashMap<>();
  private int nextPlaywrightRequestId = 1;

  PlaywrightNetworkMonitor(BrowserContext context) {
    context.onRequest(this::playwrightRequestStarted);
    context.onResponse(this::playwrightResponseReceived);
    context.onRequestFinished(this::playwrightRequestFinished);
    context.onRequestFailed(this::playwrightRequestFinished);
  }

  CdpNetworkMonitor forPage(Page page) {
    return pageNetworkMonitors.computeIfAbsent(page, ignored -> new CdpNetworkMonitor());
  }

  CdpNetworkMonitor getForPage(Page page) {
    return pageNetworkMonitors.get(page);
  }

  void removePage(Page page) {
    pageNetworkMonitors.remove(page);
  }

  private void playwrightRequestStarted(Request request) {
    Page requestPage = requestPage(request);
    if (requestPage == null) return;
    CdpNetworkMonitor monitor = forPage(requestPage);
    String requestId = "pw:" + nextPlaywrightRequestId++;
    playwrightRequestIds.put(request, requestId);
    monitor.process(
        "Network.requestWillBeSent",
        Map.of(
            "requestId",
            requestId,
            "type",
            cdpResourceType(request.resourceType()),
            "request",
            Map.of("url", request.url())),
        "playwright");
  }

  private void playwrightResponseReceived(Response response) {
    String requestId = playwrightRequestIds.get(response.request());
    if (requestId == null) return;
    Page requestPage = requestPage(response.request());
    CdpNetworkMonitor monitor = requestPage == null ? null : pageNetworkMonitors.get(requestPage);
    if (monitor == null) return;
    monitor.process(
        "Network.responseReceived",
        Map.of("requestId", requestId, "response", Map.of("headers", response.headers())),
        "playwright");
  }

  private void playwrightRequestFinished(Request request) {
    String requestId = playwrightRequestIds.remove(request);
    if (requestId == null) return;
    Page requestPage = requestPage(request);
    CdpNetworkMonitor monitor = requestPage == null ? null : pageNetworkMonitors.get(requestPage);
    if (monitor != null) {
      monitor.process("Network.loadingFinished", Map.of("requestId", requestId), "playwright");
    }
  }

  private static Page requestPage(Request request) {
    try {
      return request.frame().page();
    } catch (RuntimeException ignored) {
      // Popup navigation requests may arrive before Playwright creates their frame.
      return null;
    }
  }

  private static String cdpResourceType(String resourceType) {
    return switch (resourceType) {
      case "cspviolationreport" -> "CSPViolationReport";
      case "eventsource" -> "EventSource";
      case "manifest" -> "Manifest";
      case "media" -> "Media";
      case "ping" -> "Ping";
      case "prefetch" -> "Prefetch";
      case "websocket" -> "WebSocket";
      default -> resourceType;
    };
  }
}
