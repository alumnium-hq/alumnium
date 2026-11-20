package ai.alumnium.driver;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class MapGesturesTest {

  @Test
  void dragsTheContentAwayFromTheDirectionTheViewMovesIn() {
    MapGestures.Frame frame = new MapGestures.Frame(100, 200, 800, 400);

    assertThat(frame.pan(ScrollDirection.LEFT)).isEqualTo(drag(300, 400, 700, 400));
    assertThat(frame.pan(ScrollDirection.RIGHT)).isEqualTo(drag(700, 400, 300, 400));
    assertThat(frame.pan(ScrollDirection.UP)).isEqualTo(drag(500, 300, 500, 500));
    assertThat(frame.pan(ScrollDirection.DOWN)).isEqualTo(drag(500, 500, 500, 300));
  }

  @Test
  void clipsAFrameToTheViewportAndRejectsOneThatIsOffScreen() {
    assertThat(new MapGestures.Frame(100, 200, 800, 600).clipTo(1000, 600))
        .isEqualTo(new MapGestures.Frame(100, 200, 800, 400));
    assertThatThrownBy(
            () -> new MapGestures.Frame(0, 900, 800, 100).clipTo(1000, 600).pan(ScrollDirection.UP))
        .hasMessageContaining("no visible area");
  }

  @Test
  void wheelsUpToZoomInAndDownToZoomOut() {
    assertThat(MapGestures.zoomWheelDelta(ZoomDirection.IN)).isEqualTo(-40);
    assertThat(MapGestures.zoomWheelDelta(ZoomDirection.OUT)).isEqualTo(40);
  }

  private static MapGestures.Drag drag(double startX, double startY, double endX, double endY) {
    return new MapGestures.Drag(
        new MapGestures.Point(startX, startY), new MapGestures.Point(endX, endY));
  }
}
