package ai.alumnium.driver;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Keyboard keys recognized by the server for {@code PressKey} tool calls.
 */
public enum Key {
    BACKSPACE("Backspace"),
    ENTER("Enter"),
    ESCAPE("Escape"),
    TAB("Tab");

    private final String value;

    Key(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }

    /**
     * Accepts either the enum {@code name()} (e.g. {@code "ENTER"}) or the
     * tool-schema value (e.g. {@code "Enter"}) so LLM responses that echo the
     * schema-declared value round-trip correctly. Matching is case-insensitive
     * to tolerate model variance.
     */
    @JsonCreator
    public static Key fromString(String raw) {
        if (raw == null) {
            throw new IllegalArgumentException("Key must not be null");
        }
        for (Key k : values()) {
            if (k.value.equalsIgnoreCase(raw) || k.name().equalsIgnoreCase(raw)) {
                return k;
            }
        }
        throw new IllegalArgumentException("Unknown key: " + raw);
    }
}
