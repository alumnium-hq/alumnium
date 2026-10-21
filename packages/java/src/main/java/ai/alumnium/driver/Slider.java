package ai.alumnium.driver;

import java.util.Map;

/** Where to drag an ARIA slider to reach a value, as computed by {@code scripts/slider.js}. */
final class Slider {
  static final String SCRIPT = BaseDriver.loadScript("/ai/alumnium/driver/scripts/slider.js");
  static final String EXECUTE_SCRIPT = "return (" + SCRIPT + ")(arguments[0], arguments[1]);";

  /** A point in CSS pixels. */
  record Offset(double x, double y) {}

  private final Offset start;
  private final Offset end;
  private final double width;
  private final double height;

  private Slider(Map<?, ?> geometry) {
    this.start = point(geometry.get("from"));
    this.end = point(geometry.get("to"));
    this.width = number(geometry.get("width"));
    this.height = number(geometry.get("height"));
  }

  static Slider parse(Object result) {
    return result == null ? null : new Slider((Map<?, ?>) result);
  }

  Offset startOffset() {
    return start;
  }

  Offset endOffset() {
    return end;
  }

  Offset startCenterOffset() {
    return centerOffset(start);
  }

  Offset endCenterOffset() {
    return centerOffset(end);
  }

  private Offset centerOffset(Offset point) {
    return new Offset(Math.round(point.x() - width / 2), Math.round(point.y() - height / 2));
  }

  private static Offset point(Object value) {
    Map<?, ?> point = (Map<?, ?>) value;
    return new Offset(number(point.get("x")), number(point.get("y")));
  }

  private static double number(Object value) {
    return ((Number) value).doubleValue();
  }
}
