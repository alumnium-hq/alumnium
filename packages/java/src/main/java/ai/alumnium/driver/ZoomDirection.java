package ai.alumnium.driver;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Directions recognized by the server for {@code Zoom} tool calls. */
public enum ZoomDirection {
  IN("in"),
  OUT("out");

  private final String value;

  ZoomDirection(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  /** Accepts the enum {@code name()} or the tool-schema value, case-insensitively. */
  @JsonCreator
  public static ZoomDirection fromString(String raw) {
    if (raw == null) {
      throw new IllegalArgumentException("Zoom direction must not be null");
    }
    for (ZoomDirection direction : values()) {
      if (direction.value.equalsIgnoreCase(raw) || direction.name().equalsIgnoreCase(raw)) {
        return direction;
      }
    }
    throw new IllegalArgumentException("Unknown zoom direction: " + raw);
  }
}
