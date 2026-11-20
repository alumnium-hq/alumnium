package ai.alumnium.driver;

/** Geometry and timing of the gestures that pan and zoom a map. */
final class MapGestures {
  // Pointer moves between press and release, so the drag is not taken for a click.
  static final int PAN_STEPS = 10;
  // Rest before release, so the drag is not taken for a fling.
  static final int PAN_HOLD_DELAY_MS = 200;
  // Maps keep animating and loading tiles after release.
  static final int PAN_SETTLE_DELAY_MS = 300;
  // A zoom is a burst of small wheel moves with Control held, like a trackpad
  // pinch. Map libraries count the moves, their distance, or both: this burst is
  // one zoom level on Google Maps and Leaflet, and less on others.
  static final int ZOOM_WHEEL_STEPS = 5;
  static final int ZOOM_WHEEL_DELTA = 40;
  // Maps keep animating and loading tiles after zooming.
  static final int ZOOM_SETTLE_DELAY_MS = 500;

  record Point(double x, double y) {}

  record Drag(Point start, Point end) {}

  record Frame(double x, double y, double width, double height) {
    /** The part of the frame that is on screen. */
    Frame clipTo(double viewportWidth, double viewportHeight) {
      double left = Math.max(x, 0);
      double top = Math.max(y, 0);
      Frame visible =
          new Frame(
              left,
              top,
              Math.min(x + width, viewportWidth) - left,
              Math.min(y + height, viewportHeight) - top);
      if (visible.width <= 0 || visible.height <= 0) {
        throw new IllegalStateException("Map has no visible area");
      }
      return visible;
    }

    /** A drag across the middle half of the frame that moves the view in the direction. */
    Drag pan(ScrollDirection direction) {
      if (width <= 0 || height <= 0) {
        throw new IllegalStateException("Map has no visible area");
      }
      double centerX = x + width / 2;
      double centerY = y + height / 2;
      double dx = width / 4;
      double dy = height / 4;
      // The content is dragged away from the direction the view moves in.
      return switch (direction) {
        case UP -> drag(centerX, centerY - dy, centerX, centerY + dy);
        case DOWN -> drag(centerX, centerY + dy, centerX, centerY - dy);
        case LEFT -> drag(centerX - dx, centerY, centerX + dx, centerY);
        case RIGHT -> drag(centerX + dx, centerY, centerX - dx, centerY);
      };
    }

    private static Drag drag(double startX, double startY, double endX, double endY) {
      return new Drag(new Point(startX, startY), new Point(endX, endY));
    }
  }

  /** Distance of each wheel move. Wheeling up zooms in. */
  static int zoomWheelDelta(ZoomDirection direction) {
    return direction == ZoomDirection.IN ? -ZOOM_WHEEL_DELTA : ZOOM_WHEEL_DELTA;
  }

  private MapGestures() {}
}
