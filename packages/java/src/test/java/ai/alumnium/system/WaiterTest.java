package ai.alumnium.system;

import static org.assertj.core.api.Assertions.assertThat;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.driver.PlaywrightDriver;
import ai.alumnium.driver.SeleniumDriver;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Playwright;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.chrome.ChromeDriver;

class WaiterTest {
  private static final String PAGE =
      """
      <!doctype html>
      <button id="start" onclick="start()">Start</button>
      <script>
        function start() {
          document.getElementById("start").textContent = "Waiting";
          setTimeout(() => {
            const result = document.createElement("p");
            result.textContent = "Timer finished";
            document.body.appendChild(result);
          }, 500);
        }
      </script>
      """;
  private static final String NETWORK_PAGE =
      """
      <!doctype html>
      <button id="start" onclick="start()">Start</button>
      <script>
        async function start() {
          const response = await fetch("/slow");
          const result = document.createElement("p");
          result.textContent = await response.text();
          document.body.appendChild(result);
        }
      </script>
      """;
  private static final String POPUP_PAGE =
      """
      <!doctype html>
      <button id="popup" onclick="window.open('/popup-child')">Open</button>
      """;
  private static final String POPUP_CHILD_PAGE =
      """
      <!doctype html>
      <script>
        fetch("/slow").then(async response => {
          const result = document.createElement("p");
          result.textContent = await response.text();
          document.body.appendChild(result);
        });
      </script>
      """;
  private static final String OOPIF_CHILD_PAGE =
      """
      <!doctype html>
      <script>
        fetch("/slow").then(() => parent.postMessage("OOPIF finished", "*"));
      </script>
      """;
  private static Playwright playwright;
  private static Browser browser;
  private static BaseDriver driver;
  private static HttpServer server;

  @BeforeAll
  static void setUp() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/slow", WaiterTest::serveSlowResponse);
    server.createContext("/popup-child", exchange -> serve(exchange, POPUP_CHILD_PAGE));
    server.createContext("/popup", exchange -> serve(exchange, POPUP_PAGE));
    server.createContext("/oopif-child", exchange -> serve(exchange, OOPIF_CHILD_PAGE));
    server.createContext("/oopif", WaiterTest::serveOopifPage);
    server.createContext("/", exchange -> serve(exchange, NETWORK_PAGE));
    server.start();

    if ("playwright".equals(System.getenv("ALUMNIUM_DRIVER"))) {
      playwright = Playwright.create();
      browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true));
      driver = new PlaywrightDriver(browser.newPage());
    } else {
      driver = new SeleniumDriver(new ChromeDriver());
    }
  }

  @AfterAll
  static void tearDown() {
    if (driver != null) driver.quit();
    if (browser != null) browser.close();
    if (playwright != null) playwright.close();
    if (server != null) server.stop(0);
  }

  @Test
  void waitsForShortTimeoutsBeforeReadingTheTree() {
    driver.visit(
        "data:text/html;charset=utf-8,"
            + URLEncoder.encode(PAGE, StandardCharsets.UTF_8).replace("+", "%20"));
    driver.executeScript("document.getElementById('start').click()");
    driver.resetAccessibilityTree();

    assertThat(driver.accessibilityTree().toStr()).contains("Timer finished");
  }

  @Test
  void waitsForRequestsBeforeReadingTheTree() {
    driver.visit("http://127.0.0.1:" + server.getAddress().getPort());
    driver.executeScript("document.getElementById('start').click()");
    driver.resetAccessibilityTree();

    assertThat(driver.accessibilityTree().toStr()).contains("Request finished");
  }

  @Test
  void waitsForRequestsInANewTab() {
    driver.visit("http://127.0.0.1:" + server.getAddress().getPort() + "/popup");
    driver.executeScript("document.getElementById('popup').click()");
    driver.switchToNextTab();
    driver.resetAccessibilityTree();

    assertThat(driver.accessibilityTree().toStr()).contains("Request finished");
  }

  @Test
  void waitsForRequestsInACrossOriginFrame() {
    driver.visit("http://127.0.0.1:" + server.getAddress().getPort() + "/oopif");
    driver.resetAccessibilityTree();

    assertThat(driver.accessibilityTree().toStr()).contains("OOPIF finished");
  }

  private static void serveSlowResponse(HttpExchange exchange) throws IOException {
    try {
      Thread.sleep(500);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      exchange.close();
      return;
    }
    serve(exchange, "Request finished");
  }

  private static void serveOopifPage(HttpExchange exchange) throws IOException {
    String page =
        """
        <!doctype html>
        <script>
          addEventListener("message", event => {
            const result = document.createElement("p");
            result.textContent = event.data;
            document.body.appendChild(result);
          });
        </script>
        <iframe src="http://localhost:%d/oopif-child"></iframe>
        """
            .formatted(server.getAddress().getPort());
    serve(exchange, page);
  }

  private static void serve(HttpExchange exchange, String body) throws IOException {
    byte[] response = body.getBytes(StandardCharsets.UTF_8);
    exchange.sendResponseHeaders(200, response.length);
    exchange.getResponseBody().write(response);
    exchange.close();
  }
}
