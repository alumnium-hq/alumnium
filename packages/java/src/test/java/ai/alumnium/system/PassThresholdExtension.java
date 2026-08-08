package ai.alumnium.system;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.TestWatcher;

final class PassThresholdExtension implements TestWatcher {

  private static final String RESULTS_PATH = "ALUMNIUM_TEST_PASS_RESULTS_PATH";

  @Override
  public void testSuccessful(ExtensionContext context) {
    record("passed");
  }

  @Override
  public void testFailed(ExtensionContext context, Throwable cause) {
    record("failed");
  }

  private static void record(String result) {
    String path = System.getenv(RESULTS_PATH);
    if (path == null) {
      return;
    }

    try {
      Files.writeString(
          Path.of(path),
          result + System.lineSeparator(),
          StandardOpenOption.CREATE,
          StandardOpenOption.APPEND);
    } catch (IOException error) {
      throw new IllegalStateException("Could not record system test result", error);
    }
  }
}
