from os import getenv

import pytest
from pytest import mark

from alumnium import Provider


@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium-ios",
    reason="Example doesn't support drag and drop in mobile browsers",
)
@mark.xfail(
    getenv("ALUMNIUM_SELENIUM_BROWSER", "chrome") == "firefox",
    reason="Drag and drop release is not picked up in Firefox",
)
def test_drag_and_drop(al, navigate):
    if al.model.provider == Provider.DEEPSEEK:
        pytest.xfail("No vision support yet")

    navigate("the-internet/drag-and-drop.html")
    assert al.get("titles of squares ordered from left to right", vision=True) == ["A", "B"]
    al.do("move square A to square B", vision=True)
    assert al.get("titles of squares ordered from left to right", vision=True) == ["B", "A"]
