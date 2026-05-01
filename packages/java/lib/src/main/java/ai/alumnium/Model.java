package ai.alumnium;

import java.util.Objects;

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
}
