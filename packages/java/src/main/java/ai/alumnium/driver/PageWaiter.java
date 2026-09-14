package ai.alumnium.driver;

import ai.alumnium.Config;
import java.util.List;
import java.util.function.Supplier;

final class PageWaiter {
  static final String WAITER_SNAPSHOT_SCRIPT = "window[Symbol.for('alumnium')]?.snapshot()";
  private static final long POLL_MS = 10;

  private final CdpNetworkMonitor monitor;
  private final Supplier<Snapshot> snapshot;
  private final long idleMs;
  private final long timeoutMs;
  private final Runnable pollAction;

  PageWaiter(CdpNetworkMonitor monitor, Supplier<Snapshot> snapshot) {
    this(
        monitor,
        snapshot,
        Config.WAITER_IDLE_MS,
        Config.WAITER_TIMEOUT_MS,
        PageWaiter::sleepForPollInterval);
  }

  PageWaiter(
      CdpNetworkMonitor monitor,
      Supplier<Snapshot> snapshot,
      long idleMs,
      long timeoutMs,
      Runnable pollAction) {
    this.monitor = monitor;
    this.snapshot = snapshot;
    this.idleMs = idleMs;
    this.timeoutMs = timeoutMs;
    this.pollAction = pollAction;
  }

  Result waitForPageStability() {
    long startedAt = System.nanoTime();
    long deadline = startedAt + timeoutMs * 1_000_000;

    while (System.nanoTime() < deadline) {
      if (monitor.pending().isEmpty()
          && elapsedMillis(startedAt) >= idleMs
          && monitor.idleForMillis() >= idleMs) {
        Snapshot state = snapshot.get();
        if (state != null
            && "complete".equals(state.readyState())
            && state.now() - state.lastMutationAt() >= idleMs
            && state.pendingTimeouts() == 0
            && monitor.idleForMillis() >= idleMs
            && monitor.pending().isEmpty()) {
          return new Result(true, List.of());
        }
      }
      pollAction.run();
    }

    return new Result(false, monitor.pending());
  }

  private static long elapsedMillis(long startedAt) {
    return (System.nanoTime() - startedAt) / 1_000_000;
  }

  private static void sleepForPollInterval() {
    try {
      Thread.sleep(POLL_MS);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Interrupted while waiting for page stability", error);
    }
  }

  record Snapshot(long lastMutationAt, long now, int pendingTimeouts, String readyState) {}

  record Result(boolean loaded, List<String> pending) {
    Result {
      pending = List.copyOf(pending);
    }
  }
}
