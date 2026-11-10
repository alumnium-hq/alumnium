from os import getenv

from pytest import mark

unsupported_on_appium = mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Not supported on Appium driver yet",
)


@unsupported_on_appium
def test_scroll_up_list_to_load_older_messages(al, navigate):
    navigate("scrollable_list.html")
    assert "Message 41" in al.get("oldest loaded message")
    al.do("scroll up the messages until 'Message 1' is loaded")
    assert "Message 1" in al.get("oldest loaded message")


@unsupported_on_appium
def test_scroll_up_list_inside_frame(al, navigate):
    navigate("scrollable_list_frame.html")
    al.do("scroll up the messages until 'Message 1' is loaded")
    assert "Message 1" in al.get("oldest loaded message")
