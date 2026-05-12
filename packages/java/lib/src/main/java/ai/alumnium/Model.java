package ai.alumnium;

import java.util.Objects;
import java.util.Map;

/**
 * Identifies a model by {@link Provider} and model name. 
 */
public final class Model {

    private static volatile Model current = buildFromEnv();

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
     * The process-default model, derived from {@code ALUMNIUM_MODEL}
     * (format: {@code provider/name}). Falls back to {@link Provider#GITHUB}
     * under GitHub Actions, otherwise {@link Provider#OPENAI}.
     */
    public static Model current() {
        return current;
    }

    /** Used by tests; typically callers should prefer {@link #current()}. */
    public static void setCurrent(Model model) {
        current = model;
    }

    private static Model buildFromEnv() {
        String raw = System.getenv().getOrDefault("ALUMNIUM_MODEL", "");
        String providerToken = raw;
        String nameToken = null;
        int slash = raw.indexOf('/');
        if (slash >= 0) {
            providerToken = raw.substring(0, slash);
            nameToken = raw.substring(slash + 1);
        }
        providerToken = providerToken.trim().toLowerCase();
        if (providerToken.isEmpty() && System.getenv("GITHUB_ACTIONS") != null) {
            providerToken = "github";
        }
        Provider provider = Provider.fromValue(providerToken).orElse(Provider.OPENAI);
        return new Model(provider, (nameToken == null || nameToken.isBlank()) ? null : nameToken);
    }

    static final class Names {
        private Names() {}
    
        public static final Map<Provider, String> DEFAULT = Map.ofEntries(
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
            Map.entry(Provider.XAI, "grok-4-1-fast-reasoning")
        );
    
        public static String defaultFor(Provider provider) {
            return DEFAULT.getOrDefault(provider, "");
        }
    }
}
