from os import getenv

from pytest import mark

from alumnium.alumni import Alumni
from alumnium.tools import SwitchToNextTabTool, SwitchToPreviousTabTool


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Appium doesn't support tab manipulation yet",
)
def test_switching_tabs(al, driver, navigate):
    al = Alumni(
        driver,
        extra_tools=[
            SwitchToNextTabTool,
            SwitchToPreviousTabTool,
        ],
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
