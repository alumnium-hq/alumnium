package ai.alumnium.driver;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import org.junit.jupiter.api.Test;

class CdpNetworkMonitorTest {

  @Test
  void tracksRequestsBySessionUntilTheyFinish() {
    CdpNetworkMonitor monitor = new CdpNetworkMonitor();
    monitor.process("Network.requestWillBeSent", request("1", "Fetch"), "main");
    monitor.process("Network.requestWillBeSent", request("1", "Fetch"), "iframe");

    monitor.process("Network.loadingFinished", Map.of("requestId", "1"), "main");

    assertThat(monitor.pending()).containsExactly("https://example.com/1");
    monitor.clearSession("iframe");
    assertThat(monitor.pending()).isEmpty();
  }

  @Test
  void ignoresPersistentTransportsAndStreamingResponses() {
    CdpNetworkMonitor monitor = new CdpNetworkMonitor();
    monitor.process("Network.requestWillBeSent", request("socket", "WebSocket"));
    monitor.process("Network.requestWillBeSent", request("events", "EventSource"));
    monitor.process("Network.requestWillBeSent", request("stream", "Fetch"));

    monitor.process(
        "Network.responseReceived",
        Map.of(
            "requestId",
            "stream",
            "response",
            Map.of(
                "mimeType",
                "text/plain",
                "headers",
                Map.of("Content-Type", "Text/Event-Stream; charset=utf-8"))));

    assertThat(monitor.pending()).isEmpty();
  }

  @Test
  void finishesAFiniteResponseWhenAllBodyDataIsReceived() {
    CdpNetworkMonitor monitor = new CdpNetworkMonitor();
    monitor.process("Network.requestWillBeSent", request("finite", "Fetch"));
    monitor.process(
        "Network.responseReceived",
        Map.of(
            "requestId", "finite", "response", Map.of("headers", Map.of("Content-Length", "16"))));

    monitor.process(
        "Network.dataReceived",
        Map.of("requestId", "finite", "dataLength", 16, "encodedDataLength", 16));

    assertThat(monitor.pending()).isEmpty();
  }

  @Test
  void keepsAFiniteResponsePendingUntilItsFullBodyIsReceived() {
    CdpNetworkMonitor monitor = new CdpNetworkMonitor();
    monitor.process("Network.requestWillBeSent", request("partial", "Fetch"));
    monitor.process(
        "Network.responseReceived",
        Map.of(
            "requestId", "partial", "response", Map.of("headers", Map.of("content-length", "16"))));

    monitor.process(
        "Network.dataReceived",
        Map.of("requestId", "partial", "dataLength", 8, "encodedDataLength", 8));

    assertThat(monitor.pending()).containsExactly("https://example.com/partial");
  }

  @Test
  void finishesARequestTransferredToAnOopifSession() {
    CdpNetworkMonitor monitor = new CdpNetworkMonitor();
    monitor.process("Network.requestWillBeSent", request("document", "Document"), "parent");

    monitor.process("Network.loadingFinished", Map.of("requestId", "document"), "oopif");

    assertThat(monitor.pending()).isEmpty();
  }

  @Test
  void doesNotFinishAnAmbiguousRequestIdFromAnotherSession() {
    CdpNetworkMonitor monitor = new CdpNetworkMonitor();
    monitor.process("Network.requestWillBeSent", request("1", "Fetch"), "main");
    monitor.process("Network.requestWillBeSent", request("1", "Fetch"), "iframe");

    monitor.process("Network.loadingFinished", Map.of("requestId", "1"), "other");

    assertThat(monitor.pending()).containsExactly("https://example.com/1", "https://example.com/1");
  }

  @Test
  void safelyProcessesConcurrentWebSocketCallbacks() throws InterruptedException {
    CdpNetworkMonitor monitor = new CdpNetworkMonitor();
    int callbackCount = 100;
    CountDownLatch start = new CountDownLatch(1);
    List<Thread> callbacks = new ArrayList<>();
    for (int index = 0; index < callbackCount; index++) {
      String requestId = String.valueOf(index);
      callbacks.add(
          Thread.ofPlatform()
              .unstarted(
                  () -> {
                    await(start);
                    monitor.process("Network.requestWillBeSent", request(requestId, "Fetch"));
                    monitor.process("Network.loadingFinished", Map.of("requestId", requestId));
                  }));
    }

    callbacks.forEach(Thread::start);
    start.countDown();
    for (Thread callback : callbacks) callback.join();

    assertThat(monitor.pending()).isEmpty();
    assertThat(monitor.idleForMillis()).isGreaterThanOrEqualTo(0);
  }

  private static Map<String, Object> request(String requestId, String type) {
    return Map.of(
        "requestId",
        requestId,
        "type",
        type,
        "request",
        Map.of("url", "https://example.com/" + requestId));
  }

  private static void await(CountDownLatch latch) {
    try {
      latch.await();
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(error);
    }
  }
}
