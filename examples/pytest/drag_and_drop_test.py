from os import getenv

from pytest import mark

from alumnium import Model, Provider


@mark.xfail(Model.current.provider == Provider.DEEPSEEK, reason="No vision support yet")
@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium",
    reason="Example doesn't support drag and drop in mobile browsers",
)
def test_drag_and_drop(al, navigate):
    navigate("https://the-internet.herokuapp.com/drag_and_drop")
    assert al.get("titles of squares ordered from left to right", vision=True) == ["A", "B"]
    al.do("move square A to square B")
    assert al.get("titles of squares ordered from left to right", vision=True) == ["B", "A"]
