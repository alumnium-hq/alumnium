package ai.alumnium;

import java.util.Optional;

/** Model provider identifiers. */
public enum Provider {
  ANTHROPIC("anthropic"),
  AWS("aws"),
  AZURE("azure"),
  CODEX("codex"),
  CURSOR("cursor"),
  DEEPSEEK("deepseek"),
  GOOGLE("google"),
  META("meta"),
  MISTRALAI("mistralai"),
  OLLAMA("ollama"),
  OPENAI("openai"),
  OPENROUTER("openrouter"),
  XAI("xai");

  private final String value;

  Provider(String value) {
    this.value = value;
  }

  public String value() {
    return value;
  }

  public static Optional<Provider> fromValue(String value) {
    if (value == null || value.isEmpty()) {
      return Optional.empty();
    }
    String normalized = value.trim().toLowerCase();
    for (Provider p : values()) {
      if (p.value.equals(normalized)) {
        return Optional.of(p);
      }
    }
    return Optional.empty();
  }
}
