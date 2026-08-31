from os import getenv

from pytest import mark


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Not supported on Appium driver yet",
)
def test_click_element_covered_by_sticky_bar(al, navigate):
    navigate("obscured_element.html")
    al.do("click the 'Click Me' button")
    assert "button clicked" in al.get("status message")
