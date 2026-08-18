package ai.alumnium.driver;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

final class CdpNetworkMonitor {
  private static final Set<String> IGNORED_RESOURCE_TYPES =
      Set.of(
          "CSPViolationReport",
          "EventSource",
          "Manifest",
          "Media",
          "Ping",
          "Prefetch",
          "WebSocket");
  private static final Set<String> STREAMING_CONTENT_TYPES =
      Set.of("text/event-stream", "multipart/x-mixed-replace");

  private final Map<String, String> pending = new LinkedHashMap<>();
  private long lastActivityAt = System.nanoTime();

  void process(String method, Map<String, ?> params) {
    process(method, params, "");
  }

  synchronized void process(String method, Map<String, ?> params, String sessionId) {
    switch (method) {
      case "Network.requestWillBeSent" -> requestStarted(params, sessionId);
      case "Network.responseReceived" -> responseReceived(params, sessionId);
      case "Network.loadingFinished", "Network.loadingFailed" -> finish(params, sessionId);
      default -> {
        // Other CDP events do not affect network idleness.
      }
    }
  }

  synchronized List<String> pending() {
    return List.copyOf(pending.values());
  }

  synchronized long idleForMillis() {
    return (System.nanoTime() - lastActivityAt) / 1_000_000;
  }

  synchronized void clear() {
    pending.clear();
    lastActivityAt = System.nanoTime();
  }

  synchronized void clearSession(String sessionId) {
    String prefix = sessionId + ":";
    pending.keySet().removeIf(key -> key.startsWith(prefix));
    lastActivityAt = System.nanoTime();
  }

  private void requestStarted(Map<String, ?> params, String sessionId) {
    String requestId = string(params.get("requestId"));
    if (requestId == null || requestId.isEmpty()) return;

    String key = key(sessionId, requestId);
    if (IGNORED_RESOURCE_TYPES.contains(params.get("type"))) {
      pending.remove(key);
      return;
    }

    String url = "";
    if (params.get("request") instanceof Map<?, ?> request) {
      String value = string(request.get("url"));
      if (value != null) url = value;
    }
    pending.put(key, url);
    lastActivityAt = System.nanoTime();
  }

  private void responseReceived(Map<String, ?> params, String sessionId) {
    if (!(params.get("response") instanceof Map<?, ?> response)) return;

    Object contentType = null;
    if (response.get("headers") instanceof Map<?, ?> headers) {
      for (Map.Entry<?, ?> header : headers.entrySet()) {
        if ("content-type".equalsIgnoreCase(String.valueOf(header.getKey()))) {
          contentType = header.getValue();
          break;
        }
      }
    }
    if (contentType == null) contentType = response.get("mimeType");
    if (contentType == null) return;

    String mimeType = String.valueOf(contentType).split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
    if (STREAMING_CONTENT_TYPES.contains(mimeType)) finish(params, sessionId);
  }

  private void finish(Map<String, ?> params, String sessionId) {
    String requestId = string(params.get("requestId"));
    if (requestId == null || requestId.isEmpty()) return;
    String requestKey = key(sessionId, requestId);
    if (pending.remove(requestKey) != null) {
      lastActivityAt = System.nanoTime();
      return;
    }

    String suffix = ":" + requestId;
    List<String> transferred =
        pending.keySet().stream().filter(key -> key.endsWith(suffix)).toList();
    if (transferred.size() == 1 && pending.remove(transferred.get(0)) != null) {
      lastActivityAt = System.nanoTime();
    }
  }

  private static String key(String sessionId, String requestId) {
    return sessionId + ":" + requestId;
  }

  private static String string(Object value) {
    return value == null ? null : String.valueOf(value);
  }
}
