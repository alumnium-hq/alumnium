package ai.alumnium.driver;

import java.util.Map;

/** Sets ARIA sliders by following the steps computed by {@code scripts/slider.js}. */
final class Slider {
  static final String SCRIPT = BaseDriver.loadScript("/ai/alumnium/driver/scripts/slider.js");
  static final String EXECUTE_SCRIPT =
      "return (" + SCRIPT + ")(arguments[0], arguments[1], arguments[2]);";
  static final String EVALUATE_SCRIPT =
      "(element, [value, reset]) => (" + SCRIPT + ")(element, value, reset)";

  static final String SET_INPUT_VALUE_SCRIPT =
      "("
          + BaseDriver.loadScript("/ai/alumnium/driver/scripts/setInputValue.js")
          + ")(arguments[0], arguments[1]);";

  static final int MAX_STEPS = 100;

  record Offset(double x, double y) {}

  /**
   * How a driver performs slider steps. ARIA sliders only respond to real pointer events, so these
   * must not be emulated with scripts.
   */
  interface Actions {
    Object next(boolean reset);

    void down(Point point);

    void move(Point point);

    void up();
  }

  /** A pointer position over a slider, relative to the slider element. */
  record Point(double x, double y, double width, double height) {
    static Point of(Map<?, ?> step) {
      return new Point(
          number(step.get("x")),
          number(step.get("y")),
          number(step.get("width")),
          number(step.get("height")));
    }

    Offset offset() {
      return new Offset(x, y);
    }

    Offset centerOffset() {
      return new Offset(Math.round(x - width / 2), Math.round(y - height / 2));
    }
  }

  private Slider() {}

  /**
   * Performs steps until the slider reaches the value or gets as close as it can.
   *
   * @return false when the element is a native input, which callers set directly
   */
  static boolean set(Actions actions) {
    boolean pressed = false;
    try {
      for (int i = 0; i < MAX_STEPS; i++) {
        Object result = actions.next(i == 0);
        if (result == null) return false;

        Map<?, ?> step = (Map<?, ?>) result;
        switch (String.valueOf(step.get("action"))) {
          case "done" -> {
            return true;
          }
          case "down" -> {
            pressed = true;
            actions.down(Point.of(step));
          }
          case "move" -> actions.move(Point.of(step));
          case "up" -> {
            pressed = false;
            actions.up();
          }
          default -> throw new IllegalStateException("Unknown slider step: " + step);
        }
      }
      return true;
    } finally {
      // Never leave the pointer pressed, e.g. when the slider got re-rendered.
      if (pressed) {
        try {
          actions.up();
        } catch (RuntimeException ignored) {
          // The original error is more useful.
        }
      }
    }
  }

  private static double number(Object value) {
    return ((Number) value).doubleValue();
  }
}
