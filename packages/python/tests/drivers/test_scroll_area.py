from alumnium.drivers.scroll_area import ScrollDirection, wheel_delta


def test_scrolls_80_percent_of_the_visible_area_in_the_requested_direction():
    area = {"width": 1000, "height": 500}

    assert wheel_delta(ScrollDirection.UP, area) == (0, -400)
    assert wheel_delta(ScrollDirection.DOWN, area) == (0, 400)
    assert wheel_delta(ScrollDirection.LEFT, area) == (-800, 0)
    assert wheel_delta(ScrollDirection.RIGHT, area) == (800, 0)
