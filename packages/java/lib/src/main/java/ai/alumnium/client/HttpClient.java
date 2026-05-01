package ai.alumnium.client;

import ai.alumnium.Model;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Thin HTTP client that talks to the alumnium server. 
 *
 * <p>Transport details:
 * <ul>
 *   <li>Uses {@link java.net.http.HttpClient} on a virtual-thread executor.</li>
 *   <li>Serialises/deserialises JSON with Jackson.</li>
 * </ul>
 */
public final class HttpClient implements AutoCloseable {

    public static final String DEFAULT_SERVER_HOST = "127.0.0.1";

    private static final Logger LOG = LoggerFactory.getLogger(HttpClient.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> MAP_OF_OBJECT =
        new TypeReference<Map<String, Object>>() {};

    private final java.net.http.HttpClient http;
    private final String baseUrl;
    private final AtomicReference<String> sessionId = new AtomicReference<>();
    private Thread shutdownHook;

    /**
     * @param url                explicit server URL
     * @param model              {@link Model} to be used by the session
     * @param platform           driver platform string (e.g. {@code "web-selenium"})
     * @param toolSchemas        JSON-serialisable tool schemas (maps or annotated POJOs)
     * @param planner            enable the planner agent
     * @param excludeAttributes  accessibility-tree attributes to drop before serialising
     */
    public HttpClient(String url,
                      Model model,
                      String platform,
                      List<?> toolSchemas,
                      boolean planner,
                      Set<String> excludeAttributes) {
        this.http = java.net.http.HttpClient.newBuilder()
            .executor(Executors.newVirtualThreadPerTaskExecutor())
            .connectTimeout(Duration.ofSeconds(30))
            .build();
        this.baseUrl = url;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", model.provider().value());
        body.put("name", model.name());
        body.put("tools", toolSchemas == null ? List.of() : toolSchemas);
        body.put("platform", platform);
        body.put("planner", planner);
        body.put("exclude_attributes", excludeAttributes == null ? List.of() : List.copyOf(excludeAttributes));

        JsonNode resp = postJson("/v1/sessions", body, Duration.ofSeconds(30));
        sessionId.set(resp.path("session_id").asText(null));
    }

    public String baseUrl() { return baseUrl; }
    public String sessionId() { return sessionId.get(); }

    @Override
    public void close() {
        quit();
    }

    public void quit() {
        String id = sessionId.getAndSet(null);
        if (id != null) {
            delete("/v1/sessions/" + id, Duration.ofSeconds(30));
        }
    }

    // region Plans / steps / statements

    public record PlanResult(String explanation, List<String> steps) {}

    public PlanResult planActions(String goal, String accessibilityTree) {
        return planActions(goal, accessibilityTree, "unknown");
    }

    public PlanResult planActions(String goal, String accessibilityTree, String app) {
        JsonNode data = postJson("/v1/sessions/" + requireSession() + "/plans",
            Map.of("goal", goal, "accessibility_tree", accessibilityTree, "app", app),
            Duration.ofSeconds(120));
        return new PlanResult(data.path("explanation").asText(""), toStringList(data.path("steps")));
    }

    public record ActionResult(String explanation, List<Map<String, Object>> actions) {}

    public ActionResult executeAction(String goal, String step, String accessibilityTree) {
        return executeAction(goal, step, accessibilityTree, "unknown");
    }

    public ActionResult executeAction(String goal, String step, String accessibilityTree, String app) {
        JsonNode data = postJson("/v1/sessions/" + requireSession() + "/steps",
            Map.of("goal", goal, "step", step, "accessibility_tree", accessibilityTree, "app", app),
            Duration.ofSeconds(120));
        return new ActionResult(data.path("explanation").asText(""), toListOfMap(data.path("actions")));
    }

    public record RetrieveResult(String explanation, Data result) {}

    public RetrieveResult retrieve(String statement,
                                   String accessibilityTree,
                                   String title,
                                   String url,
                                   String screenshot,
                                   String app) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("statement", statement);
        body.put("accessibility_tree", accessibilityTree);
        body.put("title", title);
        body.put("url", url);
        body.put("screenshot", screenshot);
        body.put("app", app == null ? "unknown" : app);
        JsonNode data = postJson("/v1/sessions/" + requireSession() + "/statements", body,
            Duration.ofSeconds(120));
        Object rawResult = MAPPER.convertValue(data.path("result"), Object.class);
        return new RetrieveResult(data.path("explanation").asText(""), Data.looselyTypecast(rawResult));
    }

    public Map<String, Object> findElement(String description, String accessibilityTree, String app) {
        JsonNode data = postJson("/v1/sessions/" + requireSession() + "/elements",
            Map.of("description", description, "accessibility_tree", accessibilityTree,
                   "app", app == null ? "unknown" : app),
            Duration.ofSeconds(60));
        JsonNode elements = data.path("elements");
        if (!elements.isArray() || elements.isEmpty()) {
            throw new IllegalStateException("Server returned no elements for description: " + description);
        }
        return MAPPER.convertValue(elements.get(0), MAP_OF_OBJECT);
    }

    public String analyzeChanges(String beforeTree,
                                 String beforeUrl,
                                 String afterTree,
                                 String afterUrl,
                                 String app) {
        Map<String, Object> body = Map.of(
            "before", Map.of("accessibility_tree", beforeTree, "url", beforeUrl),
            "after",  Map.of("accessibility_tree", afterTree,  "url", afterUrl),
            "app",    app == null ? "unknown" : app
        );
        JsonNode data = postJson("/v1/sessions/" + requireSession() + "/changes", body,
            Duration.ofSeconds(120));
        return data.path("result").asText("");
    }

    public Map<String, Object> addExample(String goal, List<String> actions) {
        JsonNode data = postJson("/v1/sessions/" + requireSession() + "/examples",
            Map.of("goal", goal, "actions", actions),
            Duration.ofSeconds(30));
        return MAPPER.convertValue(data, MAP_OF_OBJECT);
    }

    public void clearExamples() {
        delete("/v1/sessions/" + requireSession() + "/examples", Duration.ofSeconds(30));
    }

    public Map<String, Object> stats() {
        JsonNode data = getJson("/v1/sessions/" + requireSession() + "/stats", Duration.ofSeconds(30));
        return MAPPER.convertValue(data, MAP_OF_OBJECT);
    }

    /** GET /v1/health. Returns {@code true} if the server reports ready. */
    public boolean health() {
        try {
            HttpResponse<String> resp = send(
                HttpRequest.newBuilder(URI.create(baseUrl + "/v1/health"))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build());
            return resp.statusCode() >= 200 && resp.statusCode() < 300;
        } catch (IOException e) {
            return false;
        }
    }

    private String requireSession() {
        String id = sessionId.get();
        if (id == null) {
            throw new IllegalStateException("Session has been closed");
        }
        return id;
    }

    private JsonNode postJson(String path, Object body, Duration timeout) {
        try {
            String payload = MAPPER.writeValueAsString(body);
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .build();
            return parseResponse(send(req));
        } catch (IOException e) {
            throw ioToConnectionError(e);
        }
    }

    private JsonNode getJson(String path, Duration timeout) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(timeout)
                .header("Accept", "application/json")
                .GET()
                .build();
            return parseResponse(send(req));
        } catch (IOException e) {
            throw ioToConnectionError(e);
        }
    }

    private void delete(String path, Duration timeout) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(timeout)
                .DELETE()
                .build();
            HttpResponse<String> resp = send(req);
            raiseForStatus(resp);
        } catch (IOException e) {
            throw ioToConnectionError(e);
        }
    }

    private HttpResponse<String> send(HttpRequest req) throws IOException {
        try {
            return http.send(req, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted during HTTP " + req.method() + " " + req.uri(), e);
        }
    }

    private JsonNode parseResponse(HttpResponse<String> resp) throws IOException {
        raiseForStatus(resp);
        String body = resp.body();
        if (body == null || body.isEmpty()) {
            return MAPPER.nullNode();
        }
        return MAPPER.readTree(body);
    }

    private void raiseForStatus(HttpResponse<String> resp) {
        int code = resp.statusCode();
        if (code >= 200 && code < 300) return;
        String body = resp.body();
        throw new HttpResponseException(code,
            "HTTP " + code + " from " + resp.request().method() + " "
                + resp.request().uri() + ": "
                + (body == null ? "<no body>" : body));
    }

    private RuntimeException ioToConnectionError(IOException e) {
        if (e instanceof ConnectException ce) {
            return new ConnectionClosedException(ce.getMessage(), ce);
        }
        return new ConnectionClosedException(e.getMessage(), e);
    }

    private static List<String> toStringList(JsonNode node) {
        if (node == null || !node.isArray()) return List.of();
        return MAPPER.convertValue(node, new TypeReference<List<String>>() {});
    }

    private static List<Map<String, Object>> toListOfMap(JsonNode node) {
        if (node == null || !node.isArray()) return List.of();
        return MAPPER.convertValue(node, new TypeReference<List<Map<String, Object>>>() {});
    }

    /** Thrown when the server returned a non-2xx status. */
    public static final class HttpResponseException extends RuntimeException {
        private final int statusCode;

        public HttpResponseException(int statusCode, String message) {
            super(message);
            this.statusCode = statusCode;
        }

        public int statusCode() { return statusCode; }
    }

    /** Thrown when the HTTP transport could not reach the server. */
    public static final class ConnectionClosedException extends RuntimeException {
        public ConnectionClosedException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
