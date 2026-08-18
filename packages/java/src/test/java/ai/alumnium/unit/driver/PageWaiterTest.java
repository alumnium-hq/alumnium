package ai.alumnium.driver;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class PageWaiterTest {

  @Test
  void packagesTheSharedWaiterScript() {
    String script = BaseDriver.loadScript("/ai/alumnium/driver/scripts/waiter.js");

    assertThat(script).contains("pendingTimeouts", "snapshot()");
  }

  @Test
  void waitsForBrowserTimeoutsAndUsesPollAction() {
    CdpNetworkMonitor monitor = new CdpNetworkMonitor();
    AtomicInteger polls = new AtomicInteger();
    AtomicInteger snapshots = new AtomicInteger();
    PageWaiter waiter =
        new PageWaiter(
            monitor,
            () -> snapshot(snapshots.incrementAndGet() == 1 ? 1 : 0),
            0,
            100,
            polls::incrementAndGet);

    PageWaiter.Result result = waiter.waitForPageStability();

    assertThat(result.loaded()).isTrue();
    assertThat(result.pending()).isEmpty();
    assertThat(snapshots).hasValue(2);
    assertThat(polls).hasValue(1);
  }

  @Test
  void requiresCompleteAndMutationIdleSnapshots() {
    CdpNetworkMonitor monitor = new CdpNetworkMonitor();
    AtomicInteger snapshots = new AtomicInteger();
    PageWaiter waiter =
        new PageWaiter(
            monitor,
            () -> {
              int call = snapshots.incrementAndGet();
              if (call == 1) return new PageWaiter.Snapshot(0, 100, 0, "interactive");
              if (call == 2) return new PageWaiter.Snapshot(90, 100, 0, "complete");
              return snapshot(0);
            },
            25,
            200,
            () -> sleep(10));

    assertThat(waiter.waitForPageStability().loaded()).isTrue();
    assertThat(snapshots.get()).isGreaterThanOrEqualTo(3);
  }

  @Test
  void rechecksNetworkQuietAfterSnapshot() {
    CdpNetworkMonitor monitor = new CdpNetworkMonitor();
    AtomicInteger snapshots = new AtomicInteger();
    PageWaiter waiter =
        new PageWaiter(
            monitor,
            () -> {
              snapshots.incrementAndGet();
              monitor.process("Network.requestWillBeSent", request("fast"));
              monitor.process("Network.loadingFinished", Map.of("requestId", "fast"));
              return snapshot(0);
            },
            25,
            70,
            () -> sleep(10));

    PageWaiter.Result result = waiter.waitForPageStability();

    assertThat(result.loaded()).isFalse();
    assertThat(result.pending()).isEmpty();
    assertThat(snapshots.get()).isGreaterThanOrEqualTo(1);
  }

  private static PageWaiter.Snapshot snapshot(int pendingTimeouts) {
    return new PageWaiter.Snapshot(0, 100, pendingTimeouts, "complete");
  }

  private static Map<String, Object> request(String requestId) {
    return Map.of(
        "requestId",
        requestId,
        "type",
        "Fetch",
        "request",
        Map.of("url", "https://example.com/" + requestId));
  }

  private static void sleep(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(error);
    }
  }
}
