package ai.alumnium.util;

import ai.alumnium.Config;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Retry utility mirroring {@code packages/typescript/src/utils/retry.ts}.
 *
 * <p>Defaults are read from {@link Config#RETRIES} and {@link Config#DELAY}. {@link
 * Config#NO_RETRY} bypasses retries when set. All {@link Throwable}s are retried unless a {@link
 * DoRetry} predicate filters them.
 */
public final class Retry {

  private static final Logger LOG = LoggerFactory.getLogger(Retry.class);

  private Retry() {}

  @FunctionalInterface
  public interface Operation<T> {
    T execute() throws Throwable;
  }

  @FunctionalInterface
  public interface DoRetry {
    boolean test(Throwable error);
  }

  public static final class Options {
    public Integer maxAttempts;
    public Long backOffMillis;
    public DoRetry doRetry;
  }

  public static <T> T execute(Operation<T> op) {
    return execute(new Options(), op);
  }

  public static <T> T execute(Options options, Operation<T> op) {
    int maxAttempts = options.maxAttempts != null ? options.maxAttempts : Config.RETRIES;
    long backOffMillis =
        options.backOffMillis != null ? options.backOffMillis : (long) (Config.DELAY * 1000);

    Throwable lastError = null;

    for (int attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return op.execute();
      } catch (Throwable error) {
        LOG.debug("Error on attempt {}", attempt, error);
        lastError = error;

        if (options.doRetry != null && !options.doRetry.test(error)) {
          LOG.debug("Not retrying error: {}", error.getMessage());
          sneakyThrow(error);
        }

        if (Config.NO_RETRY) {
          LOG.info("ALUMNIUM_NO_RETRY is set, not retrying after error", error);
          sneakyThrow(error);
        }

        if (attempt < maxAttempts) {
          LOG.debug(
              "Attempt {}/{} failed, retrying in {}ms: {}",
              attempt,
              maxAttempts,
              backOffMillis,
              error.getMessage());
          try {
            Thread.sleep(backOffMillis);
          } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            sneakyThrow(ie);
          }
        } else {
          LOG.debug("Attempt {}/{} failed, no more retries", attempt, maxAttempts);
        }
      }
    }

    if (lastError != null) {
      sneakyThrow(lastError);
    }
    throw new IllegalStateException("Retry failed with no error captured");
  }

  @SuppressWarnings("unchecked")
  private static <E extends Throwable> void sneakyThrow(Throwable t) throws E {
    throw (E) t;
  }
}
