package ai.alumnium.unit.client;

import static org.assertj.core.api.Assertions.assertThat;

import ai.alumnium.client.FindElementResult;
import ai.alumnium.client.HttpClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class HttpClientTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final AtomicReference<JsonNode> elementsBody = new AtomicReference<>();
  private HttpServer server;
  private HttpClient client;

  @BeforeEach
  void startServer() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/v1/sessions",
        exchange -> {
          String path = exchange.getRequestURI().getPath();
          if (path.equals("/v1/sessions")) {
            respond(exchange, "{\"session_id\":\"session\",\"model\":\"openai/gpt\"}");
          } else if (path.equals("/v1/sessions/session/elements")) {
            elementsBody.set(MAPPER.readTree(exchange.getRequestBody()));
            respond(exchange, "{\"elements\":[{\"id\":1,\"explanation\":\"button\"}]}");
          } else {
            respond(exchange, "{}");
          }
        });
    server.start();
    client =
        new HttpClient(
            "http://127.0.0.1:" + server.getAddress().getPort(),
            null,
            "web-selenium",
            List.of(),
            true,
            Set.of());
  }

  @AfterEach
  void stopServer() {
    client.close();
    server.stop(0);
  }

  @Test
  void findElementOmitsCacheByDefault() {
    FindElementResult result = client.findElement("login button", "<tree/>", "app");

    assertThat(result.id()).isEqualTo(1);
    assertThat(elementsBody.get().has("cache")).isFalse();
    assertThat(elementsBody.get().path("description").asText()).isEqualTo("login button");
  }

  @Test
  void findElementSendsCacheFalse() {
    FindElementResult result = client.findElement("login button", "<tree/>", "app", false);

    assertThat(result.id()).isEqualTo(1);
    assertThat(elementsBody.get().path("cache").isBoolean()).isTrue();
    assertThat(elementsBody.get().path("cache").asBoolean()).isFalse();
  }

  private static void respond(HttpExchange exchange, String body) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set("Content-Type", "application/json");
    exchange.sendResponseHeaders(200, bytes.length);
    exchange.getResponseBody().write(bytes);
    exchange.close();
  }
}
