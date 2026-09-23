package ai.alumnium.driver;

import ai.alumnium.Config;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

final class PageWaiter {
  static final String WAITER_SNAPSHOT_SCRIPT = "window[Symbol.for('alumnium')]?.snapshot()";
  private static final long POLL_MS = 10;

  private final Supplier<Snapshot> snapshot;
  private final long idleMs;
  private final long timeoutMs;
  private final Runnable pollAction;

  PageWaiter(Supplier<Snapshot> snapshot) {
    this(
        snapshot,
        Config.WAITER_IDLE_MS,
        Config.WAITER_TIMEOUT_MS,
        PageWaiter::sleepForPollInterval);
  }

  PageWaiter(Supplier<Snapshot> snapshot, long idleMs, long timeoutMs, Runnable pollAction) {
    this.snapshot = snapshot;
    this.idleMs = idleMs;
    this.timeoutMs = timeoutMs;
    this.pollAction = pollAction;
  }

  Result waitForPageStability() {
    long startedAt = System.nanoTime();
    long deadline = startedAt + timeoutMs * 1_000_000;

    List<String> pending = List.of();
    while (System.nanoTime() < deadline) {
      if (elapsedMillis(startedAt) >= idleMs) {
        Snapshot state = snapshot.get();
        pending = state == null ? List.of() : state.pendingRequests();
        if (state != null
            && "complete".equals(state.readyState())
            && state.now() - Math.max(state.lastMutationAt(), state.lastRequestAt()) >= idleMs
            && state.pendingTimeouts() == 0
            && pending.isEmpty()) {
          return new Result(true, List.of());
        }
      }
      pollAction.run();
    }

    return new Result(false, pending);
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

  record Snapshot(
      long lastMutationAt,
      long lastRequestAt,
      long now,
      int pendingTimeouts,
      String readyState,
      List<String> pendingRequests) {
    Snapshot {
      pendingRequests = List.copyOf(pendingRequests);
    }

    Snapshot(long lastMutationAt, long now, int pendingTimeouts, String readyState) {
      this(lastMutationAt, 0, now, pendingTimeouts, readyState, List.of());
    }

    static Snapshot fromScript(Map<?, ?> snapshot) {
      List<String> pendingRequests =
          snapshot.get("pendingRequests") instanceof List<?> urls
              ? urls.stream().map(String::valueOf).toList()
              : List.of();
      return new Snapshot(
          number(snapshot.get("lastMutationAt")),
          number(snapshot.get("lastRequestAt")),
          number(snapshot.get("now")),
          (int) number(snapshot.get("pendingTimeouts")),
          String.valueOf(snapshot.get("readyState")),
          pendingRequests);
    }

    private static long number(Object value) {
      return value instanceof Number number ? number.longValue() : 0;
    }
  }

  record Result(boolean loaded, List<String> pending) {
    Result {
      pending = List.copyOf(pending);
    }
  }
}
