from os import getenv

from pytest import mark


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Frames support is only implemented for Playwright and Selenium currently",
)
def test_nested_frames(al, navigate):
    navigate("the-internet/nested-frames.html")

    al.do("click MIDDLE text")
    assert al.get("text from all frames") == ["LEFT", "MIDDLE", "RIGHT", "BOTTOM"]


@mark.xfail(
    "playwright" != getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Frames support is only implemented for Playwright currently",
)
def test_cross_origin_iframe(al, navigate):
    navigate("cross_origin_iframe.html")

    al.check("button 'Main Page Button' is present")
    al.check("'Password' field is present")
    al.do("type 'testuser' in the text input field")
    al.check("Text input contains 'testuser'")
    al.do("click Submit button")
    al.check("'Form submitted' message is present")


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Frames support is only implemented for Playwright and Selenium currently",
)
def test_iframe_sharing_page_url(al, navigate):
    navigate("same_url_iframe.html")

    al.do("click Increment button")
    al.check("count is 1")


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Frames support is only implemented for Playwright and Selenium currently",
)
def test_areas_in_and_out_of_iframe(al, navigate):
    navigate("iframe_area.html")

    frame_counter = al.area("Frame counter section")
    main_counter = al.area("Main counter section")
    frame_counter.do("click Increment button")
    main_counter.do("click Increment button")
    al.check("frame count is 1")
    al.check("main count is 1")
