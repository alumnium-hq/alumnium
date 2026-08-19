package ai.alumnium.system;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.TestWatcher;

final class PassThresholdExtension implements TestWatcher {

  private static final String RESULTS_PATH = "ALUMNIUM_TEST_PASS_RESULTS_PATH";

  @Override
  public void testSuccessful(ExtensionContext context) {
    record(context.getUniqueId(), "passed");
  }

  @Override
  public void testFailed(ExtensionContext context, Throwable cause) {
    record(context.getUniqueId(), "failed");
  }

  private static void record(String testId, String result) {
    String path = System.getenv(RESULTS_PATH);
    if (path == null) {
      return;
    }

    Path resultsPath = Path.of(path);
    try (FileChannel channel =
        FileChannel.open(
            resultsPath,
            StandardOpenOption.CREATE,
            StandardOpenOption.READ,
            StandardOpenOption.WRITE)) {
      FileLock lock = channel.lock();
      try {
        Map<String, String> results = new LinkedHashMap<>();
        for (String line : Files.readAllLines(resultsPath)) {
          int separator = line.lastIndexOf('=');
          if (separator > 0) {
            results.put(line.substring(0, separator), line.substring(separator + 1));
          }
        }
        results.put(testId, result);
        channel.truncate(0);
        channel.position(0);
        channel.write(
            ByteBuffer.wrap(
                String.join(
                        System.lineSeparator(),
                        results.entrySet().stream()
                            .map(entry -> entry.getKey() + "=" + entry.getValue())
                            .toList())
                    .concat(System.lineSeparator())
                    .getBytes(StandardCharsets.UTF_8)));
      } finally {
        lock.release();
      }
    } catch (IOException error) {
      throw new IllegalStateException("Could not record system test result", error);
    }
  }
}
