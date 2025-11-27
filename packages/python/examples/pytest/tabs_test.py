from os import getenv

from pytest import mark


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Autoswitching is not implemented in Appium yet",
)
def test_autoswitch_to_tab(al, navigate):
    navigate("https://the-internet.herokuapp.com/windows")
    al.do("click on 'Click Here' link")
    assert al.get("header text") == "New Window"
