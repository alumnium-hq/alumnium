package ai.alumnium;

import java.util.Map;
import java.util.Objects;

/** Identifies a model by {@link Provider} and model name. */
public final class Model {

  private static volatile Model current = fromEnv();

  private final Provider provider;
  private final String name;

  public Model(Provider provider, String name) {
    this.provider = Objects.requireNonNullElse(provider, Provider.OPENAI);
    this.name = (name == null || name.isEmpty()) ? Names.defaultFor(this.provider) : name;
  }

  public Model() {
    this(null, null);
  }

  public Provider provider() {
    return provider;
  }

  public String name() {
    return name;
  }

  /**
   * The process-default model, derived from {@code ALUMNIUM_MODEL} (format: {@code provider/name}).
   * Falls back to {@link Provider#GITHUB} when running under GitHub Actions. Returns {@code null}
   * when neither is set.
   */
  public static Model current() {
    return current;
  }

  /** Used by tests; typically callers should prefer {@link #current()}. */
  public static void setCurrent(Model model) {
    current = model;
  }

  /**
   * Parses a model string of the form {@code provider/name} (as returned by the alumnium server).
   * The name is optional — when omitted, the provider's default model is used.
   */
  public static Model fromString(String model) {
    if (model == null || model.isBlank()) {
      return null;
    }

    String providerToken = model;
    String nameToken = null;
    int slash = model.indexOf('/');
    if (slash >= 0) {
      providerToken = model.substring(0, slash);
      nameToken = model.substring(slash + 1);
    }
    Provider provider = Provider.fromValue(providerToken).orElse(Provider.OPENAI);
    return new Model(provider, (nameToken == null || nameToken.isBlank()) ? null : nameToken);
  }

  /**
   * Resolves the default model from environment variables. Mirrors Python's {@code
   * Model.from_env()}: parses {@code ALUMNIUM_MODEL} when set, otherwise uses {@link
   * Provider#GITHUB} under GitHub Actions, otherwise returns {@code null}.
   */
  private static Model fromEnv() {
    Model fromConfig = fromString(Config.MODEL);
    if (fromConfig != null) {
      return fromConfig;
    }
    if (System.getenv("GITHUB_ACTIONS") != null) {
      return new Model(Provider.GITHUB, null);
    }
    return null;
  }

  static final class Names {
    private Names() {}

    public static final Map<Provider, String> DEFAULT =
        Map.ofEntries(
            Map.entry(Provider.AZURE_FOUNDRY, "gpt-5-nano"),
            Map.entry(Provider.AZURE_OPENAI, "gpt-5-nano"),
            Map.entry(Provider.ANTHROPIC, "claude-haiku-4-5-20251001"),
            Map.entry(Provider.AWS_ANTHROPIC, "us.anthropic.claude-haiku-4-5-20251001-v1:0"),
            Map.entry(Provider.AWS_META, "us.meta.llama4-maverick-17b-instruct-v1:0"),
            Map.entry(Provider.CODEX, "gpt-5.4-mini"),
            Map.entry(Provider.DEEPSEEK, "deepseek-reasoner"),
            Map.entry(Provider.GITHUB, "gpt-4o-mini"),
            Map.entry(Provider.GOOGLE, "gemini-3.1-flash-lite-preview"),
            Map.entry(Provider.MISTRALAI, "mistral-medium-2505"),
            Map.entry(Provider.OLLAMA, "qwen3.6"),
            Map.entry(Provider.OPENAI, "gpt-5-nano-2025-08-07"),
            Map.entry(Provider.XAI, "grok-4-1-fast-reasoning"));

    public static String defaultFor(Provider provider) {
      return DEFAULT.getOrDefault(provider, "");
    }
  }
}
