from pytest import raises

from alumnium.drivers.map_gestures import ZoomDirection, clip_to_viewport, pan_points, zoom_wheel_delta
from alumnium.drivers.scroll_area import ScrollDirection


def test_drags_the_content_away_from_the_direction_the_view_moves_in():
    frame = {"x": 100, "y": 200, "width": 800, "height": 400}

    assert pan_points(frame, ScrollDirection.LEFT) == ((300, 400), (700, 400))
    assert pan_points(frame, ScrollDirection.RIGHT) == ((700, 400), (300, 400))
    assert pan_points(frame, ScrollDirection.UP) == ((500, 300), (500, 500))
    assert pan_points(frame, ScrollDirection.DOWN) == ((500, 500), (500, 300))


def test_rejects_a_map_that_is_off_screen():
    with raises(RuntimeError, match="no visible area"):
        pan_points({"x": 0, "y": 900, "width": 800, "height": -100}, ScrollDirection.LEFT)


def test_clips_a_box_to_the_viewport():
    box = {"x": 100, "y": 200, "width": 800, "height": 600}

    assert clip_to_viewport(box, {"width": 1000, "height": 600}) == {"x": 100, "y": 200, "width": 800, "height": 400}


def test_rejects_a_box_that_is_outside_the_viewport():
    with raises(RuntimeError, match="no visible area"):
        clip_to_viewport({"x": 0, "y": 900, "width": 800, "height": 100}, {"width": 1000, "height": 600})


def test_wheels_up_to_zoom_in_and_down_to_zoom_out():
    assert zoom_wheel_delta(ZoomDirection.IN) == -40
    assert zoom_wheel_delta(ZoomDirection.OUT) == 40
