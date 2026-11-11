package ai.alumnium.driver;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Directions recognized by the server for {@code ScrollInDirection} tool calls. */
public enum ScrollDirection {
  UP("up"),
  DOWN("down"),
  LEFT("left"),
  RIGHT("right");

  private final String value;

  ScrollDirection(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  /** Accepts the enum {@code name()} or the tool-schema value, case-insensitively. */
  @JsonCreator
  public static ScrollDirection fromString(String raw) {
    if (raw == null) {
      throw new IllegalArgumentException("Scroll direction must not be null");
    }
    for (ScrollDirection direction : values()) {
      if (direction.value.equalsIgnoreCase(raw) || direction.name().equalsIgnoreCase(raw)) {
        return direction;
      }
    }
    throw new IllegalArgumentException("Unknown scroll direction: " + raw);
  }
}
