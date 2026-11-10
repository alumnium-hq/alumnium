from alumnium.drivers.scroll_area import ScrollArea, ScrollDirection


def test_parses_script_result():
    area = ScrollArea.from_script({"offsetX": 300, "offsetY": 2300, "width": 600, "height": 500})

    assert area == ScrollArea(offset_x=300, offset_y=2300, width=600, height=500)


def test_parses_off_screen_area_as_none():
    assert ScrollArea.from_script(None) is None


def test_scrolls_most_of_the_scroll_area_in_the_requested_direction():
    area = ScrollArea(offset_x=0, offset_y=0, width=1000, height=500)

    assert area.wheel_delta(ScrollDirection.UP) == (0, -400)
    assert area.wheel_delta(ScrollDirection.DOWN) == (0, 400)
    assert area.wheel_delta(ScrollDirection.LEFT) == (-800, 0)
    assert area.wheel_delta(ScrollDirection.RIGHT) == (800, 0)
