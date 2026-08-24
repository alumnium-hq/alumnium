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

  private final Map<String, PendingRequest> pending = new LinkedHashMap<>();
  private long lastActivityAt = System.nanoTime();

  void process(String method, Map<String, ?> params) {
    process(method, params, "");
  }

  synchronized void process(String method, Map<String, ?> params, String sessionId) {
    switch (method) {
      case "Network.requestWillBeSent" -> requestStarted(params, sessionId);
      case "Network.responseReceived" -> responseReceived(params, sessionId);
      case "Network.dataReceived" -> dataReceived(params, sessionId);
      case "Network.loadingFinished", "Network.loadingFailed" -> finish(params, sessionId);
      default -> {
        // Other CDP events do not affect network idleness.
      }
    }
  }

  synchronized List<String> pending() {
    return pending.values().stream().map(request -> request.url).toList();
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
    pending.put(key, new PendingRequest(url));
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
    if (contentType != null) {
      String mimeType =
          String.valueOf(contentType).split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
      if (STREAMING_CONTENT_TYPES.contains(mimeType)) {
        finish(params, sessionId);
        return;
      }
    }

    Object contentLength = header(response, "content-length");
    if (contentLength == null) return;
    long parsedContentLength;
    try {
      parsedContentLength = Long.parseLong(String.valueOf(contentLength));
    } catch (NumberFormatException ignored) {
      return;
    }
    if (parsedContentLength < 0) return;

    String key = requestKey(string(params.get("requestId")), sessionId);
    PendingRequest request = key == null ? null : pending.get(key);
    if (request == null) return;
    request.contentLength = parsedContentLength;
    if (request.received >= parsedContentLength) finishKey(key);
  }

  private void dataReceived(Map<String, ?> params, String sessionId) {
    String key = requestKey(string(params.get("requestId")), sessionId);
    PendingRequest request = key == null ? null : pending.get(key);
    if (request == null) return;
    long encodedLength = number(params.get("encodedDataLength"));
    request.received += encodedLength > 0 ? encodedLength : number(params.get("dataLength"));
    if (request.contentLength != null && request.received >= request.contentLength) finishKey(key);
  }

  private void finish(Map<String, ?> params, String sessionId) {
    String requestId = string(params.get("requestId"));
    String requestKey = requestKey(requestId, sessionId);
    if (requestKey != null) finishKey(requestKey);
  }

  private String requestKey(String requestId, String sessionId) {
    if (requestId == null || requestId.isEmpty()) return null;
    String requestKey = key(sessionId, requestId);
    if (pending.containsKey(requestKey)) return requestKey;
    String suffix = ":" + requestId;
    List<String> transferred =
        pending.keySet().stream().filter(key -> key.endsWith(suffix)).toList();
    return transferred.size() == 1 ? transferred.get(0) : null;
  }

  private void finishKey(String key) {
    if (pending.remove(key) != null) lastActivityAt = System.nanoTime();
  }

  private static Object header(Map<?, ?> response, String name) {
    if (!(response.get("headers") instanceof Map<?, ?> headers)) return null;
    for (Map.Entry<?, ?> header : headers.entrySet()) {
      if (name.equalsIgnoreCase(String.valueOf(header.getKey()))) return header.getValue();
    }
    return null;
  }

  private static long number(Object value) {
    return value instanceof Number number ? number.longValue() : 0;
  }

  private static String key(String sessionId, String requestId) {
    return sessionId + ":" + requestId;
  }

  private static String string(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private static final class PendingRequest {
    private final String url;
    private Long contentLength;
    private long received;

    private PendingRequest(String url) {
      this.url = url;
    }
  }
}
