package ai.alumnium;

import java.util.Map;
import java.util.Objects;

/** Identifies a model by {@link Provider} and model name. */
public final class Model {

  private static volatile Model current = fromEnv();

  private final Provider provider;
  private final String name;

  @SuppressWarnings("deprecation")
  public Model(Provider provider, String name) {
    Provider resolved = Objects.requireNonNullElse(provider, Provider.OPENAI);
    boolean blank = name == null || name.isEmpty();
    String legacyName = Names.LEGACY_AWS.get(resolved);
    if (legacyName != null) {
      resolved = Provider.AWS;
      if (blank) {
        name = legacyName;
        blank = false;
      }
    }
    this.provider = resolved;
    this.name = blank ? Names.defaultFor(this.provider) : name;
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
   * Returns {@code null} when it is not set.
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
   * Model.from_env()}: parses {@code ALUMNIUM_MODEL} when set, otherwise returns {@code null}.
   */
  private static Model fromEnv() {
    return fromString(Config.MODEL);
  }

  static final class Names {
    private Names() {}

    public static final Map<Provider, String> DEFAULT =
        Map.ofEntries(
            Map.entry(Provider.ANTHROPIC, "claude-haiku-4-5-20251001"),
            Map.entry(Provider.AWS, "us.openai.gpt-6-luna"),
            Map.entry(Provider.AZURE, "gpt-6-luna"),
            Map.entry(Provider.CODEX, "gpt-6-luna"),
            Map.entry(Provider.CURSOR, "composer-2.5"),
            Map.entry(Provider.DEEPSEEK, "deepseek-flash"),
            Map.entry(Provider.GOOGLE, "gemini-3.5-flash-lite"),
            Map.entry(Provider.MISTRALAI, "mistral-medium-3-5"),
            Map.entry(Provider.OLLAMA, "qwen3.6"),
            Map.entry(Provider.OPENAI, "gpt-6-luna"),
            Map.entry(Provider.OPENROUTER, "openai/gpt-6-luna"),
            Map.entry(Provider.XAI, "grok-4.3"));

    /** Deprecated providers now served by {@link Provider#AWS}, with their default models. */
    @SuppressWarnings("deprecation")
    static final Map<Provider, String> LEGACY_AWS =
        Map.of(
            Provider.AWS_ANTHROPIC, "us.anthropic.claude-haiku-4-5-20251001-v1:0",
            Provider.AWS_META, "us.meta.llama4-maverick-17b-instruct-v1:0");

    public static String defaultFor(Provider provider) {
      return DEFAULT.getOrDefault(provider, "");
    }
  }
}
