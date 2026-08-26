package ai.alumnium.system;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

/** Serves a page whose button opens a tab that only navigates after a delay. */
final class SlowTabPage implements AutoCloseable {

  private static final String OPENER =
      "<title>Opener</title><h1>Opener</h1>"
          + "<button onclick=\"window.open('/slow-tab', '_blank')\">Open Slow Tab</button>";
  private static final String SLOW_TAB = "<title>Slow Tab</title><h1>Slow Tab</h1>";

  private final HttpServer server;
  final String url;
  final String slowTabUrl;

  private SlowTabPage(HttpServer server) {
    this.server = server;
    int port = server.getAddress().getPort();
    this.url = "http://127.0.0.1:" + port + "/";
    this.slowTabUrl = "http://127.0.0.1:" + port + "/slow-tab";
  }

  static SlowTabPage start() throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/", SlowTabPage::respond);

    // The slow tab blocks its own request, so it must not block the opener
    server.setExecutor(Executors.newCachedThreadPool());
    server.start();
    return new SlowTabPage(server);
  }

  private static void respond(com.sun.net.httpserver.HttpExchange exchange) throws IOException {
    boolean isSlowTab = exchange.getRequestURI().getPath().equals("/slow-tab");
    if (isSlowTab) {
      try {
        Thread.sleep(2000);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new IOException(e);
      }
    }

    byte[] body = (isSlowTab ? SLOW_TAB : OPENER).getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().add("content-type", "text/html");
    exchange.getResponseHeaders().add("cache-control", "no-store");
    exchange.sendResponseHeaders(200, body.length);
    try (OutputStream out = exchange.getResponseBody()) {
      out.write(body);
    }
  }

  @Override
  public void close() {
    server.stop(0);
  }
}
