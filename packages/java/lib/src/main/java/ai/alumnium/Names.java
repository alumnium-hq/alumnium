package ai.alumnium;

import java.util.Map;

/**
 * Default model names per provider. 
 */
public final class Names {
    private Names() {}

    public static final Map<Provider, String> DEFAULT = Map.ofEntries(
        Map.entry(Provider.AZURE_FOUNDRY, "gpt-5-nano"),
        Map.entry(Provider.AZURE_OPENAI, "gpt-5-nano"),
        Map.entry(Provider.ANTHROPIC, "claude-haiku-4-5-20251001"),
        Map.entry(Provider.AWS_ANTHROPIC, "us.anthropic.claude-haiku-4-5-20251001-v1:0"),
        Map.entry(Provider.AWS_META, "us.meta.llama4-maverick-17b-instruct-v1:0"),
        Map.entry(Provider.DEEPSEEK, "deepseek-reasoner"),
        Map.entry(Provider.GITHUB, "gpt-4o-mini"),
        Map.entry(Provider.GOOGLE, "gemini-3.1-flash-lite-preview"),
        Map.entry(Provider.MISTRALAI, "mistral-medium-2505"),
        Map.entry(Provider.OLLAMA, "qwen3.6"),
        Map.entry(Provider.OPENAI, "gpt-5-nano-2025-08-07"),
        Map.entry(Provider.XAI, "grok-4-1-fast-reasoning")
    );

    public static String defaultFor(Provider provider) {
        return DEFAULT.getOrDefault(provider, "");
    }
}
