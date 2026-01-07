from os import getenv

from pytest import mark


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Iframe support is only implemented for Playwright currently",
)
@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "selenium",
    reason="Iframe support is only implemented for Playwright currently",
)
def test_nested_frames(al, navigate):
    """Test that elements inside nested iframes can be accessed transparently."""
    navigate("https://the-internet.herokuapp.com/nested_frames")

    # The nested_frames page has:
    # - A top frame containing LEFT, MIDDLE, RIGHT text
    # - A bottom frame containing BOTTOM text
    assert al.get("text that says MIDDLE") == "MIDDLE"
    assert al.get("text that says BOTTOM") == "BOTTOM"
    assert al.get("text that says LEFT") == "LEFT"
    assert al.get("text that says RIGHT") == "RIGHT"
