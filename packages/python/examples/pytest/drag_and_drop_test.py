from os import getenv

import pytest
from pytest import mark

from alumnium import Provider


@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium-ios",
    reason="Example doesn't support drag and drop in mobile browsers",
)
def test_drag_and_drop(al, navigate):
    if al.model.provider == Provider.DEEPSEEK:
        pytest.xfail("No vision support yet")

    navigate("https://the-internet.herokuapp.com/drag_and_drop")
    assert al.get("titles of squares ordered from left to right", vision=True) == ["A", "B"]
    al.do("move square A to square B")
    assert al.get("titles of squares ordered from left to right", vision=True) == ["B", "A"]
