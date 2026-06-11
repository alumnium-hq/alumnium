package ai.alumnium.unit.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.alumnium.Model;
import ai.alumnium.client.HttpClient;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Tests that HttpClient enforces presence of 'model' in /v1/sessions response. */
public class HttpClientSessionModelTest {

  private HttpServer server;
  private String baseUrl;

  @BeforeEach
  void startServer() throws Exception {
    server = HttpServer.create(new InetSocketAddress(0), 0);
    server.start();
    baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
  }

  @AfterEach
  void stopServer() {
    if (server != null) {
      server.stop(0);
    }
  }

  @Test
  void constructsWhenModelPresent() {
    // Arrange: stub POST /v1/sessions with model and session_id
    String sessionId = "abc123";
    server.createContext(
        "/v1/sessions",
        new JsonHandler(
            200,
            '{'
                + "\"session_id\":\""
                + sessionId
                + "\","
                + "\"model\":\"openai/gpt-5-nano-2025-08-07\","
                + "\"platform\":\"chromium\""
                + '}'));
    server.createContext("/v1/sessions/" + sessionId, new EmptyHandler(204));

    // Act
    HttpClient client =
        new HttpClient(baseUrl, null, "chromium", List.of(), false, (Set<String>) null);

    // Assert
    Model m = client.model();
    assertThat(m).isNotNull();
    assertThat(m.provider().value()).isEqualTo("openai");
    assertThat(m.name()).isEqualTo("gpt-5-nano-2025-08-07");

    // Cleanup
    client.close();
  }

  @Test
  void throwsWhenModelMissing() {
    // Arrange: stub POST /v1/sessions missing 'model'
    server.createContext(
        "/v1/sessions",
        new JsonHandler(
            200, '{' + "\"session_id\":\"missing-model\"," + "\"platform\":\"chromium\"" + '}'));

    // Act + Assert
    assertThatThrownBy(
            () -> new HttpClient(baseUrl, null, "chromium", List.of(), false, (Set<String>) null))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("missing required 'model'");
  }

  private static class JsonHandler implements HttpHandler {
    private final int status;
    private final String body;

    JsonHandler(int status, String body) {
      this.status = status;
      this.body = body;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
      byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().add("Content-Type", "application/json");
      exchange.sendResponseHeaders(status, bytes.length);
      try (OutputStream os = exchange.getResponseBody()) {
        os.write(bytes);
      }
    }
  }

  private static class EmptyHandler implements HttpHandler {
    private final int status;

    EmptyHandler(int status) {
      this.status = status;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
      exchange.sendResponseHeaders(status, -1);
      exchange.close();
    }
  }
}
