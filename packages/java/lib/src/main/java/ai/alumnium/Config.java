package ai.alumnium;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Process-wide Alumnium configuration derived from environment variables.
 */
public final class Config {
    public static final boolean CHANGE_ANALYSIS = parseBool("ALUMNIUM_CHANGE_ANALYSIS", false);
    public static final double DELAY = parseDouble("ALUMNIUM_DELAY", 0.5);
    public static final Set<String> EXCLUDE_ATTRIBUTES = parseCsv("ALUMNIUM_EXCLUDE_ATTRIBUTES");
    public static final boolean FULL_PAGE_SCREENSHOT = parseBool("ALUMNIUM_FULL_PAGE_SCREENSHOT", false);
    public static final boolean PLANNER = parseBool("ALUMNIUM_PLANNER", true);
    public static final int RETRIES = parseInt("ALUMNIUM_RETRIES", 2);
    public static final String SERVER_URL = emptyToNull(System.getenv("ALUMNIUM_SERVER_URL"));
    public static final String MODEL = emptyToNull(System.getenv("ALUMNIUM_MODEL"));
    public static final String LOG_LEVEL = System.getenv().getOrDefault("ALUMNIUM_LOG_LEVEL", "WARNING").toUpperCase();
    public static final String LOG_PATH = System.getenv().getOrDefault("ALUMNIUM_LOG_PATH", "stdout");

    private Config() {}

    private static boolean parseBool(String name, boolean defaultValue) {
        String v = System.getenv(name);
        if (v == null || v.isEmpty()) {
            return defaultValue;
        }
        return v.equalsIgnoreCase("true");
    }

    private static double parseDouble(String name, double defaultValue) {
        String v = System.getenv(name);
        if (v == null || v.isEmpty()) {
            return defaultValue;
        }
        try {
            return Double.parseDouble(v);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private static int parseInt(String name, int defaultValue) {
        String v = System.getenv(name);
        if (v == null || v.isEmpty()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(v);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private static Set<String> parseCsv(String name) {
        String raw = System.getenv(name);
        if (raw == null || raw.isEmpty()) {
            return Set.of();
        }
        Set<String> out = new LinkedHashSet<>();
        for (String token : raw.split(",")) {
            String trimmed = token.trim();
            if (!trimmed.isEmpty()) {
                out.add(trimmed);
            }
        }
        return Collections.unmodifiableSet(out);
    }

    private static String emptyToNull(String v) {
        return (v == null || v.isEmpty()) ? null : v;
    }
}
