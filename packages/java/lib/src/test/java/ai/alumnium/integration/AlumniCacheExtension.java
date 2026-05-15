package ai.alumnium.integration;

import ai.alumnium.Alumni;
import java.util.function.Supplier;
import org.junit.jupiter.api.extension.AfterTestExecutionCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

/**
 * After each test, persists the Alumnium server LLM cache on success or discards it on failure,
 * matching the Python pytest hook in {@code packages/python/examples/pytest/conftest.py}.
 */
public final class AlumniCacheExtension implements AfterTestExecutionCallback {

  private final Supplier<Alumni> alumni;

  public AlumniCacheExtension(Supplier<Alumni> alumni) {
    this.alumni = alumni;
  }

  @Override
  public void afterTestExecution(ExtensionContext context) {
    Alumni a = alumni.get();
    if (a == null) {
      return;
    }
    if (context.getExecutionException().isEmpty()) {
      a.cache().save();
    } else {
      a.cache().discard();
    }
  }
}
