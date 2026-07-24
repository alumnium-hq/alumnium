package ai.alumnium.cli;

public record ProcessResult(int exitCode, String stdout, String stderr) {

  public void check() {
    if (exitCode != 0) {
      throw new CliException(
          "alumnium CLI exited with code "
              + exitCode
              + (stderr.isBlank() ? "" : ":\n" + stderr.strip()));
    }
  }
}
