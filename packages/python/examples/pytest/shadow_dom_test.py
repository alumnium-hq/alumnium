from os import getenv

from pytest import mark


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Shadow DOM support is not implemented in Appium yet",
)
def test_shadow_dom(al, navigate):
    navigate("shadow_dom.html")

    page_text = al.get("page text")
    assert "This is inside Shadow DOM!" in page_text
    assert "This is another text inside Shadow DOM!" in page_text

    al.do("click first shadow button")
    page_text = al.get("page text")
    assert "Shadow Button 1 was clicked!" in page_text
    assert "This is inside Shadow DOM!" not in page_text

    al.do("click second shadow button")
    page_text = al.get("page text")
    assert "Shadow Button 2 was clicked!" in page_text
    assert "This is another text inside Shadow DOM!" not in page_text
