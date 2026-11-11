package ai.alumnium.driver;

import java.util.Map;

/** Measures the area that scrolls an element with {@code scripts/scrollArea.js}. */
final class ScrollArea {
  static final String SCRIPT = BaseDriver.loadScript("/ai/alumnium/driver/scripts/scrollArea.js");
  // Playwright calls an expression that evaluates to a function with the element.
  static final String EVALUATE_SCRIPT = "(" + SCRIPT + ")";
  static final String EXECUTE_SCRIPT = "return (" + SCRIPT + ")(arguments[0]);";
  // Wheel input does not wait for scrolling to finish.
  static final int SETTLE_DELAY_MS = 300;

  /**
   * The visible part of the area: its center relative to the element and in top-level viewport
   * coordinates, and its size.
   */
  record Measurement(
      double offsetX,
      double offsetY,
      double viewportX,
      double viewportY,
      double width,
      double height) {
    static Measurement of(Object result, int id) {
      if (!(result instanceof Map<?, ?> area)) {
        throw new IllegalStateException("Element " + id + " has no visible scroll area");
      }
      return new Measurement(
          number(area.get("offsetX")),
          number(area.get("offsetY")),
          number(area.get("viewportX")),
          number(area.get("viewportY")),
          number(area.get("width")),
          number(area.get("height")));
    }

    /** Scrolls 80% of the area's visible size, so consecutive scrolls overlap. */
    Delta wheelDelta(ScrollDirection direction) {
      int x = (int) Math.round(width * 0.8);
      int y = (int) Math.round(height * 0.8);
      return switch (direction) {
        case UP -> new Delta(0, -y);
        case DOWN -> new Delta(0, y);
        case LEFT -> new Delta(-x, 0);
        case RIGHT -> new Delta(x, 0);
      };
    }
  }

  record Delta(int x, int y) {}

  private ScrollArea() {}

  private static double number(Object value) {
    return ((Number) value).doubleValue();
  }
}
