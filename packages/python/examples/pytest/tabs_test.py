from os import getenv

from pytest import mark

from alumnium.tools import SwitchToNextTabTool, SwitchToPreviousTabTool


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Appium doesn't support tab manipulation yet",
)
def test_switching_tabs(al_factory, navigate):
    al = al_factory(
        extra_tools=[
            SwitchToNextTabTool,
            SwitchToPreviousTabTool,
        ]
    )

    navigate("multi_tab_page.html")

    al.do("click on 'Open New Tab' button")
    assert al.get("current page URL") == "about:blank"

    al.do("switch to previous browser tab")
    assert al.get("header text") == "Multi-Tab Test Page"

    al.do("switch to next browser tab")
    assert al.get("current page URL") == "about:blank"

    al.do("switch to next browser tab")
    assert al.get("header text") == "Multi-Tab Test Page"

    al.do("switch to previous browser tab")
    assert al.get("current page URL") == "about:blank"


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Appium doesn't support tab manipulation yet",
)
def test_switching_to_slowly_opening_tab(al, navigate, slow_tab_page):
    navigate(slow_tab_page.url)

    al.do("click on 'Open Slow Tab' button")

    # al.get() is too slow which gives tab enough time to arrive on its own
    assert al.driver.url == slow_tab_page.slow_tab_url
    assert al.get("header text") == "Slow Tab"


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Appium doesn't support tab manipulation yet",
)
def test_staying_on_tab_when_autoswitch_is_off(al, navigate, slow_tab_page, wait_for_tab_count):
    al.driver.autoswitch_to_new_tab = False

    navigate(slow_tab_page.url)

    al.do("click on 'Open Slow Tab' button")

    # Only assert once the tab is really there, otherwise nothing can be
    # picked up and the test passes even when the switch is ignored
    wait_for_tab_count(2)

    assert al.get("header text") == "Opener"
    assert al.driver.url == slow_tab_page.url
