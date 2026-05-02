package ai.alumnium;

import java.util.Optional;

/**
 * Model provider identifiers. 
 */
public enum Provider {
    AZURE_OPENAI("azure_openai"),
    AZURE_FOUNDRY("azure_foundry"),
    ANTHROPIC("anthropic"),
    AWS_ANTHROPIC("aws_anthropic"),
    AWS_META("aws_meta"),
    DEEPSEEK("deepseek"),
    GITHUB("github"),
    GOOGLE("google"),
    MISTRALAI("mistralai"),
    OLLAMA("ollama"),
    OPENAI("openai"),
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
