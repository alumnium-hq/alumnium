package ai.alumnium.cli;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Locates the alumnium CLI binary on the classpath and extracts it to a local cache directory.
 *
 * <p>The platform-specific CLI JAR (e.g. {@code ai.alumnium:alumnium-cli-darwin-arm64}) provides a
 * {@code ai/alumnium/cli/binary.properties} resource declaring the binary's resource path and file
 * name. This class reads those properties, extracts the binary, and returns a usable executable
 * path.
 */
public final class BinaryResolver {

  private static final Logger LOG = LoggerFactory.getLogger(BinaryResolver.class);
  private static final String PROPERTIES_RESOURCE = "ai/alumnium/cli/binary.properties";

  private static volatile Path cachedPath;

  private BinaryResolver() {}

  /** Returns the path to the extracted, executable CLI binary. */
  public static Path resolve() {
    Path path = cachedPath;
    if (path != null && Files.exists(path)) {
      return path;
    }
    synchronized (BinaryResolver.class) {
      path = cachedPath;
      if (path != null && Files.exists(path)) {
        return path;
      }
      cachedPath = doResolve();
      return cachedPath;
    }
  }

  private static Path doResolve() {
    Properties props = loadProperties();
    String resourcePath = props.getProperty("resource");
    String fileName = props.getProperty("name");

    InputStream in = BinaryResolver.class.getClassLoader().getResourceAsStream(resourcePath);
    if (in == null) {
      throw new IllegalStateException(
          "CLI binary resource not found at "
              + resourcePath
              + " despite binary.properties being"
              + " present. The alumnium-cli JAR may be corrupted.");
    }

    try (in) {
      Path cacheDir = Path.of(System.getProperty("user.home"), ".alumnium", "bin");
      Files.createDirectories(cacheDir);
      Path target = cacheDir.resolve(fileName);

      if (Files.exists(target)) {
        LOG.debug("Using cached CLI binary: {}", target);
        return target;
      }

      LOG.info("Extracting alumnium CLI binary to {}", target);
      Path tmp = Files.createTempFile(cacheDir, "alumnium-", ".tmp");
      try {
        Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
        tmp.toFile().setExecutable(true);
        Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE);
      } catch (Exception e) {
        Files.deleteIfExists(tmp);
        // Another process may have beaten us to it
        if (Files.exists(target)) {
          return target;
        }
        throw e;
      }

      return target;
    } catch (IOException e) {
      throw new UncheckedIOException("Failed to extract alumnium CLI binary", e);
    }
  }

  private static Properties loadProperties() {
    try (InputStream in =
        BinaryResolver.class.getClassLoader().getResourceAsStream(PROPERTIES_RESOURCE)) {
      if (in == null) {
        throw new IllegalStateException(
            "No alumnium CLI binary found on classpath. "
                + "Add ai.alumnium:alumnium-cli-<os>-<arch> to your dependencies.");
      }
      Properties props = new Properties();
      props.load(in);
      return props;
    } catch (IOException e) {
      throw new UncheckedIOException("Failed to read CLI binary properties", e);
    }
  }
}
