package ai.alumnium.cli;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Thin wrapper around the alumnium CLI binary.
 *
 * <p>Mirrors the Python {@code alumnium.cli} module — resolves the platform-specific binary via
 * {@link BinaryResolver} and executes it with {@link ProcessBuilder}.
 */
public final class Cli {

  private static final Logger LOG = LoggerFactory.getLogger(Cli.class);

  private Cli() {}

  public static ProcessResult run(String... args) {
    return run(List.of(args));
  }

  public static ProcessResult run(List<String> args) {
    Path binary = BinaryResolver.resolve();
    List<String> command = new ArrayList<>(args.size() + 1);
    command.add(binary.toString());
    command.addAll(args);

    LOG.debug("Running CLI: {}", command);

    try {
      Process process = new ProcessBuilder(command).start();

      String stdout;
      String stderr;
      try (InputStream outStream = process.getInputStream();
          InputStream errStream = process.getErrorStream()) {
        stdout = new String(outStream.readAllBytes(), StandardCharsets.UTF_8);
        stderr = new String(errStream.readAllBytes(), StandardCharsets.UTF_8);
      }

      int exitCode = process.waitFor();
      return new ProcessResult(exitCode, stdout, stderr);
    } catch (IOException e) {
      throw new UncheckedIOException("Failed to execute alumnium CLI", e);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new CliException("Interrupted while waiting for alumnium CLI", e);
    }
  }

  public static ProcessResult runServer(Map<String, Object> options) {
    return run(buildArgs("server", options));
  }

  static List<String> buildArgs(String subcommand, Map<String, Object> options) {
    List<String> args = new ArrayList<>();
    args.add(subcommand);
    for (Map.Entry<String, Object> entry : options.entrySet()) {
      Object value = entry.getValue();
      if (value == null) {
        continue;
      }
      String flag = "--" + entry.getKey().replace('_', '-');
      if (value instanceof Boolean bool) {
        args.add(bool ? flag : flag + "=false");
      } else {
        args.add(flag);
        args.add(value.toString());
      }
    }
    return args;
  }
}
