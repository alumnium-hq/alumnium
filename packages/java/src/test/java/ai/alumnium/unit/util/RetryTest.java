package ai.alumnium.unit.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.alumnium.util.Retry;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class RetryTest {

  private static Retry.Options opts(int maxAttempts, long backOffMillis) {
    Retry.Options o = new Retry.Options();
    o.maxAttempts = maxAttempts;
    o.backOffMillis = backOffMillis;
    return o;
  }

  @Test
  void succeedsOnFirstAttempt() {
    AtomicInteger attempts = new AtomicInteger();
    String result =
        Retry.execute(
            opts(3, 0),
            () -> {
              attempts.incrementAndGet();
              return "ok";
            });

    assertThat(result).isEqualTo("ok");
    assertThat(attempts).hasValue(1);
  }

  @Test
  void retriesUntilSuccess() {
    AtomicInteger attempts = new AtomicInteger();
    String result =
        Retry.execute(
            opts(3, 0),
            () -> {
              int n = attempts.incrementAndGet();
              if (n < 3) {
                throw new RuntimeException("flaky");
              }
              return "ok";
            });

    assertThat(result).isEqualTo("ok");
    assertThat(attempts).hasValue(3);
  }

  @Test
  void rethrowsAfterExhaustingAttempts() {
    AtomicInteger attempts = new AtomicInteger();

    assertThatThrownBy(
            () ->
                Retry.execute(
                    opts(3, 0),
                    () -> {
                      attempts.incrementAndGet();
                      throw new IllegalStateException("boom");
                    }))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("boom");
    assertThat(attempts).hasValue(3);
  }

  @Test
  void retriesAssertionError() {
    AtomicInteger attempts = new AtomicInteger();

    assertThatThrownBy(
            () ->
                Retry.execute(
                    opts(2, 0),
                    () -> {
                      attempts.incrementAndGet();
                      throw new AssertionError("nope");
                    }))
        .isInstanceOf(AssertionError.class)
        .hasMessage("nope");
    assertThat(attempts).hasValue(2);
  }

  @Test
  void preservesOriginalExceptionType() {
    assertThatThrownBy(
            () ->
                Retry.<Void>execute(
                    opts(1, 0),
                    () -> {
                      throw new CustomException("custom");
                    }))
        .isInstanceOf(CustomException.class)
        .hasMessage("custom");
  }

  @Test
  void doRetryFalseShortCircuits() {
    AtomicInteger attempts = new AtomicInteger();
    Retry.Options options = opts(5, 0);
    options.doRetry = error -> false;

    assertThatThrownBy(
            () ->
                Retry.execute(
                    options,
                    () -> {
                      attempts.incrementAndGet();
                      throw new RuntimeException("once");
                    }))
        .isInstanceOf(RuntimeException.class)
        .hasMessage("once");
    assertThat(attempts).hasValue(1);
  }

  @Test
  void doRetryTrueAllowsRetry() {
    AtomicInteger attempts = new AtomicInteger();
    Retry.Options options = opts(3, 0);
    options.doRetry = error -> true;

    String result =
        Retry.execute(
            options,
            () -> {
              int n = attempts.incrementAndGet();
              if (n < 2) {
                throw new RuntimeException("flaky");
              }
              return "ok";
            });

    assertThat(result).isEqualTo("ok");
    assertThat(attempts).hasValue(2);
  }

  @Test
  void singleAttemptExecutesOnce() {
    AtomicInteger attempts = new AtomicInteger();

    assertThatThrownBy(
            () ->
                Retry.execute(
                    opts(1, 0),
                    () -> {
                      attempts.incrementAndGet();
                      throw new RuntimeException("first");
                    }))
        .isInstanceOf(RuntimeException.class);
    assertThat(attempts).hasValue(1);
  }

  private static final class CustomException extends RuntimeException {
    CustomException(String message) {
      super(message);
    }
  }
}
