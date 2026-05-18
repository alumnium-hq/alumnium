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
 * <p>Each platform-specific CLI JAR (e.g. {@code ai.alumnium:alumnium-cli-darwin-arm64}) provides a
 * properties resource at {@code ai/alumnium/cli/<os>-<arch>/binary.properties}. Multiple platform
 * JARs can coexist on the classpath without conflict — this class detects the current OS and
 * architecture to locate the right one.
 */
public final class BinaryResolver {

  private static final Logger LOG = LoggerFactory.getLogger(BinaryResolver.class);

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
    String os = detectOs();
    String arch = detectArch();
    Properties props = loadProperties(os, arch);
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

  private static Properties loadProperties(String os, String arch) {
    String propertiesPath = "ai/alumnium/cli/" + os + "-" + arch + "/binary.properties";
    try (InputStream in =
        BinaryResolver.class.getClassLoader().getResourceAsStream(propertiesPath)) {
      if (in == null) {
        throw new IllegalStateException(
            "No alumnium CLI binary found on classpath for "
                + os
                + "-"
                + arch
                + ". Add ai.alumnium:alumnium-cli-"
                + os
                + "-"
                + arch
                + " to your dependencies.");
      }
      Properties props = new Properties();
      props.load(in);
      return props;
    } catch (IOException e) {
      throw new UncheckedIOException("Failed to read CLI binary properties", e);
    }
  }

  static String detectOs() {
    String name = System.getProperty("os.name", "").toLowerCase();
    if (name.contains("mac") || name.contains("darwin")) {
      return "darwin";
    } else if (name.contains("linux")) {
      return "linux";
    } else if (name.contains("win")) {
      return "windows";
    }
    throw new UnsupportedOperationException("Unsupported OS: " + name);
  }

  static String detectArch() {
    String arch = System.getProperty("os.arch", "").toLowerCase();
    if (arch.equals("aarch64") || arch.equals("arm64")) {
      return "arm64";
    } else if (arch.equals("amd64") || arch.equals("x86_64") || arch.equals("x64")) {
      return "x64";
    }
    throw new UnsupportedOperationException("Unsupported architecture: " + arch);
  }
}
