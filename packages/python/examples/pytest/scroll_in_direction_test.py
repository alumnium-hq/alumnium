import re
from os import getenv

from pytest import mark

unsupported_on_appium = mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Not supported on Appium driver yet",
)


def first_visible_message(al) -> int:
    value = al.get("number of the first visible message")
    return int(re.search(r"\d+", str(value)).group())


@unsupported_on_appium
def test_scroll_list_up_and_down(al, navigate):
    navigate("scrollable_list.html")
    initial = first_visible_message(al)
    al.do("scroll up the messages")
    scrolled_up = first_visible_message(al)
    assert scrolled_up < initial
    al.do("scroll down the messages")
    assert first_visible_message(al) > scrolled_up


@unsupported_on_appium
def test_scroll_list_inside_frame(al, navigate):
    navigate("scrollable_list_frame.html")
    initial = first_visible_message(al)
    al.do("scroll up the messages")
    assert first_visible_message(al) < initial
