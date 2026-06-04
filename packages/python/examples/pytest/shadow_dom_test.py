from os import getenv

from pytest import mark


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Shadow DOM support is not implemented in Appium yet",
)
def test_shadow_dom(al, navigate):
    navigate("shadow_dom.html")

    assert "This is inside Shadow DOM!" in al.get("second paragraph")
    al.do("click first shadow button")
    assert "Shadow Button 1 was clicked!" in al.get("second paragraph")

    assert "This is another text inside Shadow DOM!" in al.get("third paragraph")
    al.do("click second shadow button")
    assert "Shadow Button 2 was clicked!" in al.get("third paragraph")
