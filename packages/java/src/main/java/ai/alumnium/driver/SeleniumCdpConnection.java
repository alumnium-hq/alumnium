package ai.alumnium.driver;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.openqa.selenium.Capabilities;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

final class SeleniumCdpConnection implements AutoCloseable, WebSocket.Listener {
  private static final Logger LOG = LoggerFactory.getLogger(SeleniumCdpConnection.class);
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
  private static final Duration TIMEOUT = Duration.ofSeconds(5);
  private static final Set<String> NETWORK_EVENTS =
      Set.of(
          "Network.requestWillBeSent",
          "Network.responseReceived",
          "Network.dataReceived",
          "Network.loadingFinished",
          "Network.loadingFailed");
  private static final Map<String, Object> AUTO_ATTACH_PARAMS =
      Map.of("autoAttach", true, "waitForDebuggerOnStart", true, "flatten", true);

  private final String waiterScript;
  private final AtomicLong nextId = new AtomicLong(1);
  private final ConcurrentMap<Long, CompletableFuture<JsonNode>> pending =
      new ConcurrentHashMap<>();
  private final ConcurrentMap<String, String> targetSessions = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, String> sessionParents = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, CompletableFuture<Void>> sessionConfigurations =
      new ConcurrentHashMap<>();
  private final ConcurrentMap<String, CdpNetworkMonitor> targetMonitors = new ConcurrentHashMap<>();
  private final AtomicBoolean closed = new AtomicBoolean();
  private final Object textLock = new Object();
  private final Object sendLock = new Object();
  private final StringBuilder textMessage = new StringBuilder();

  private volatile WebSocket socket;
  private volatile String activeSession = "";
  private CompletableFuture<Void> sendTail = CompletableFuture.completedFuture(null);

  private SeleniumCdpConnection(String waiterScript) {
    this.waiterScript = waiterScript;
  }

  static SeleniumCdpConnection connect(Capabilities capabilities, String waiterScript) {
    SeleniumCdpConnection connection = new SeleniumCdpConnection(waiterScript);
    try {
      URI url = websocketUrl(capabilities);
      HttpClient client = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
      connection.socket =
          client.newWebSocketBuilder().connectTimeout(TIMEOUT).buildAsync(url, connection).join();

      connection.send("Target.setAutoAttach", AUTO_ATTACH_PARAMS).join();
      connection.send("Target.setDiscoverTargets", Map.of("discover", true)).join();
      JsonNode targets = connection.send("Target.getTargets", Map.of()).join().path("targetInfos");
      if (targets.isArray()) {
        for (JsonNode target : targets) {
          if ("page".equals(target.path("type").asText())) {
            connection.awaitSession(target.path("targetId").asText());
          }
        }
      }
      return connection;
    } catch (RuntimeException e) {
      connection.close();
      throw connectionFailure(e);
    }
  }

  void activate(String windowHandle) {
    String prefix = "CDwindow-";
    String targetId =
        windowHandle.startsWith(prefix) ? windowHandle.substring(prefix.length()) : windowHandle;
    activeSession = awaitSession(targetId);
  }

  private String awaitSession(String targetId) {
    long deadline = System.nanoTime() + TIMEOUT.toNanos();
    while (System.nanoTime() < deadline) {
      String sessionId = targetSessions.get(targetId);
      CompletableFuture<Void> configuration =
          sessionId == null ? null : sessionConfigurations.get(sessionId);
      if (configuration != null) {
        try {
          configuration.get(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
          return sessionId;
        } catch (InterruptedException error) {
          Thread.currentThread().interrupt();
          throw new IllegalStateException("Interrupted activating CDP target", error);
        } catch (ExecutionException | TimeoutException error) {
          throw connectionFailure(new CompletionException(error));
        }
      }
      try {
        Thread.sleep(10);
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException("Interrupted activating CDP target", error);
      }
    }
    return "";
  }

  CdpNetworkMonitor activeMonitor() {
    return monitorForSession(activeSession);
  }

  @Override
  public void close() {
    if (!closed.compareAndSet(false, true)) return;

    failPending(new IllegalStateException("CDP connection closed"));
    WebSocket current = socket;
    if (current != null) {
      current.sendClose(WebSocket.NORMAL_CLOSURE, "").exceptionally(error -> null);
    }
    targetSessions.clear();
    sessionParents.clear();
    sessionConfigurations.clear();
    targetMonitors.clear();
    activeSession = "";
  }

  @Override
  public void onOpen(WebSocket webSocket) {
    webSocket.request(1);
  }

  @Override
  public CompletableFuture<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
    String complete = null;
    synchronized (textLock) {
      textMessage.append(data);
      if (last) {
        complete = textMessage.toString();
        textMessage.setLength(0);
      }
    }

    if (complete != null) {
      try {
        onMessage(MAPPER.readTree(complete));
      } catch (JsonProcessingException e) {
        failConnection(new IllegalStateException("Could not parse CDP message", e));
      } catch (RuntimeException e) {
        failConnection(e);
      }
    }
    webSocket.request(1);
    return CompletableFuture.completedFuture(null);
  }

  @Override
  public CompletableFuture<?> onBinary(WebSocket webSocket, ByteBuffer data, boolean last) {
    failConnection(new IllegalStateException("Received an unexpected binary CDP message"));
    webSocket.request(1);
    return CompletableFuture.completedFuture(null);
  }

  @Override
  public CompletableFuture<?> onPing(WebSocket webSocket, ByteBuffer message) {
    webSocket.request(1);
    return webSocket.sendPong(message);
  }

  @Override
  public CompletableFuture<?> onPong(WebSocket webSocket, ByteBuffer message) {
    webSocket.request(1);
    return CompletableFuture.completedFuture(null);
  }

  @Override
  public CompletableFuture<?> onClose(WebSocket webSocket, int statusCode, String reason) {
    closed.set(true);
    failPending(new IllegalStateException("CDP connection closed"));
    return CompletableFuture.completedFuture(null);
  }

  @Override
  public void onError(WebSocket webSocket, Throwable error) {
    failConnection(new IllegalStateException("CDP connection failed", error));
  }

  private CompletableFuture<JsonNode> send(String method, Map<String, ?> params) {
    return send(method, params, "", true);
  }

  private CompletableFuture<JsonNode> send(
      String method, Map<String, ?> params, String sessionId, boolean wait) {
    if (closed.get()) {
      return CompletableFuture.failedFuture(new IllegalStateException("CDP connection closed"));
    }

    long id = nextId.getAndIncrement();
    Map<String, Object> message = new java.util.LinkedHashMap<>();
    message.put("id", id);
    message.put("method", method);
    message.put("params", params);
    if (!sessionId.isEmpty()) message.put("sessionId", sessionId);

    String json;
    try {
      json = MAPPER.writeValueAsString(message);
    } catch (JsonProcessingException e) {
      return CompletableFuture.failedFuture(e);
    }

    CompletableFuture<JsonNode> response = new CompletableFuture<>();
    if (wait) {
      pending.put(id, response);
      CompletableFuture.delayedExecutor(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)
          .execute(
              () ->
                  response.completeExceptionally(
                      new TimeoutException("Timed out sending CDP command " + method)));
      response.whenComplete((result, error) -> pending.remove(id, response));
    }

    CompletableFuture<Void> written = enqueue(json);
    written.whenComplete(
        (ignored, error) -> {
          if (error != null) response.completeExceptionally(unwrap(error));
          else if (!wait) response.complete(MAPPER.createObjectNode());
        });
    return response;
  }

  private CompletableFuture<Void> enqueue(String message) {
    synchronized (sendLock) {
      sendTail =
          sendTail
              .handle((ignored, error) -> null)
              .thenCompose(
                  ignored -> {
                    WebSocket current = socket;
                    if (current == null || closed.get()) {
                      return CompletableFuture.failedFuture(
                          new IllegalStateException("CDP connection closed"));
                    }
                    return current.sendText(message, true).thenApply(webSocket -> null);
                  });
      return sendTail;
    }
  }

  private void onMessage(JsonNode message) {
    JsonNode idNode = message.get("id");
    if (idNode != null && idNode.canConvertToLong()) {
      CompletableFuture<JsonNode> command = pending.remove(idNode.longValue());
      if (command == null) return;

      JsonNode error = message.get("error");
      if (error != null && !error.isNull()) {
        String detail = error.path("message").asText("CDP command failed");
        command.completeExceptionally(new IllegalStateException(detail));
      } else {
        JsonNode result = message.get("result");
        command.complete(result == null ? MAPPER.createObjectNode() : result);
      }
      return;
    }

    String method = message.path("method").asText();
    JsonNode params = message.path("params");
    String sessionId = message.path("sessionId").asText();
    if (NETWORK_EVENTS.contains(method)) {
      monitorForSession(sessionId)
          .process(method, MAPPER.convertValue(params, MAP_TYPE), sessionId);
      return;
    }

    switch (method) {
      case "Target.attachedToTarget" -> attachedToTarget(params, sessionId);
      case "Target.detachedFromTarget" -> detachedFromTarget(params.path("sessionId").asText());
      case "Target.targetCreated" -> {
        // Browser-level auto-attach handles page targets before their scripts run.
      }
      default -> {
        // Other CDP events are not relevant to page stability.
      }
    }
  }

  private void attachedToTarget(JsonNode params, String parentSession) {
    JsonNode target = params.path("targetInfo");
    String type = target.path("type").asText();
    if (!"page".equals(type) && !"iframe".equals(type)) return;

    String sessionId = params.path("sessionId").asText();
    String targetId = target.path("targetId").asText();
    if (sessionId.isEmpty()) return;
    if (!targetId.isEmpty()) targetSessions.put(targetId, sessionId);
    sessionParents.put(sessionId, parentSession);

    configureSession(sessionId)
        .exceptionally(
            error -> {
              LOG.debug("Could not configure CDP session {}", sessionId, unwrap(error));
              return null;
            });
  }

  private void detachedFromTarget(String sessionId) {
    if (sessionId.isEmpty()) return;

    String root = rootSession(sessionId);
    CdpNetworkMonitor monitor = targetMonitors.get(root);
    Set<String> detachedSessions = ConcurrentHashMap.newKeySet();
    detachedSessions.add(sessionId);
    sessionParents.keySet().stream()
        .filter(candidate -> isDescendant(candidate, sessionId))
        .forEach(detachedSessions::add);
    if (monitor != null) detachedSessions.forEach(monitor::clearSession);
    detachedSessions.forEach(sessionParents::remove);
    detachedSessions.forEach(sessionConfigurations::remove);
    targetSessions.entrySet().removeIf(entry -> detachedSessions.contains(entry.getValue()));
    if (sessionId.equals(root)) {
      targetMonitors.remove(root);
    }
    if (detachedSessions.contains(activeSession)) activeSession = "";
  }

  private CompletableFuture<Void> configureSession(String sessionId) {
    if (sessionId == null || sessionId.isEmpty()) return CompletableFuture.completedFuture(null);
    return sessionConfigurations.computeIfAbsent(
        sessionId,
        ignored ->
            send("Target.setAutoAttach", AUTO_ATTACH_PARAMS, sessionId, true)
                .thenCompose(result -> send("Page.enable", Map.of(), sessionId, true))
                .thenCompose(result -> send("Network.enable", Map.of(), sessionId, true))
                .thenCompose(
                    result ->
                        send(
                            "Page.addScriptToEvaluateOnNewDocument",
                            Map.of("source", waiterScript, "runImmediately", true),
                            sessionId,
                            true))
                .thenCompose(
                    result -> send("Runtime.runIfWaitingForDebugger", Map.of(), sessionId, true))
                .thenApply(result -> null));
  }

  private String rootSession(String sessionId) {
    String current = sessionId;
    Set<String> visited = ConcurrentHashMap.newKeySet();
    while (visited.add(current)) {
      String parent = sessionParents.get(current);
      if (parent == null || parent.isEmpty()) break;
      current = parent;
    }
    return current;
  }

  private boolean isDescendant(String sessionId, String ancestor) {
    String current = sessionId;
    Set<String> visited = ConcurrentHashMap.newKeySet();
    while (visited.add(current)) {
      String parent = sessionParents.get(current);
      if (parent == null || parent.isEmpty()) return false;
      if (parent.equals(ancestor)) return true;
      current = parent;
    }
    return false;
  }

  private CdpNetworkMonitor monitorForSession(String sessionId) {
    return targetMonitors.computeIfAbsent(
        rootSession(sessionId), ignored -> new CdpNetworkMonitor());
  }

  private void failConnection(RuntimeException error) {
    closed.set(true);
    failPending(error);
    WebSocket current = socket;
    if (current != null) current.abort();
  }

  private void failPending(RuntimeException error) {
    pending.forEach(
        (id, command) -> {
          if (pending.remove(id, command)) command.completeExceptionally(error);
        });
  }

  private static URI websocketUrl(Capabilities capabilities) {
    Object cdp = capabilities.getCapability("se:cdp");
    if (cdp instanceof URI uri) return uri;
    if (cdp instanceof String value && !value.isBlank()) return URI.create(value);

    Object address = debuggerAddress(capabilities.getCapability("goog:chromeOptions"));
    if (address == null) {
      address = debuggerAddress(capabilities.getCapability("ms:edgeOptions"));
    }
    if (address == null || address.toString().isBlank()) {
      throw new IllegalStateException("Chromium did not expose a CDP debugger address");
    }

    URI versionUrl = URI.create("http://" + address + "/json/version");
    HttpClient client = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    HttpRequest request = HttpRequest.newBuilder(versionUrl).timeout(TIMEOUT).GET().build();
    try {
      HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        throw new IllegalStateException("CDP discovery failed: " + response.statusCode());
      }
      String url = MAPPER.readTree(response.body()).path("webSocketDebuggerUrl").asText();
      if (url.isEmpty()) {
        throw new IllegalStateException("CDP discovery returned no webSocketDebuggerUrl");
      }
      return URI.create(url);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("CDP discovery was interrupted", e);
    } catch (IOException e) {
      throw new IllegalStateException("CDP discovery failed", e);
    }
  }

  private static Object debuggerAddress(Object options) {
    return options instanceof Map<?, ?> map ? map.get("debuggerAddress") : null;
  }

  private static RuntimeException connectionFailure(RuntimeException error) {
    Throwable cause = unwrap(error);
    return cause instanceof RuntimeException runtime
        ? runtime
        : new IllegalStateException("Could not connect to Chromium CDP", cause);
  }

  private static Throwable unwrap(Throwable error) {
    Throwable current = error;
    while ((current instanceof CompletionException
            || current instanceof java.util.concurrent.ExecutionException)
        && current.getCause() != null) {
      current = current.getCause();
    }
    return current;
  }
}
