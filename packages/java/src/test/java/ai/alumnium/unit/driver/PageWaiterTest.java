package ai.alumnium.driver;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
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
    AtomicInteger polls = new AtomicInteger();
    AtomicInteger snapshots = new AtomicInteger();
    PageWaiter waiter =
        new PageWaiter(
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
    AtomicInteger snapshots = new AtomicInteger();
    PageWaiter waiter =
        new PageWaiter(
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
  void waitsForRequestsReportedByTheSnapshot() {
    PageWaiter waiter =
        new PageWaiter(
            () ->
                new PageWaiter.Snapshot(
                    0, 0, 100, 0, "complete", List.of("https://example.com/slow")),
            25,
            70,
            () -> sleep(10));

    PageWaiter.Result result = waiter.waitForPageStability();

    assertThat(result.loaded()).isFalse();
    assertThat(result.pending()).containsExactly("https://example.com/slow");
  }

  @Test
  void waitsForTheNetworkToStayQuietAfterARequest() {
    PageWaiter waiter =
        new PageWaiter(
            () -> new PageWaiter.Snapshot(0, 90, 100, 0, "complete", List.of()),
            25,
            70,
            () -> sleep(10));

    assertThat(waiter.waitForPageStability().loaded()).isFalse();
  }

  private static PageWaiter.Snapshot snapshot(int pendingTimeouts) {
    return new PageWaiter.Snapshot(0, 100, pendingTimeouts, "complete");
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
