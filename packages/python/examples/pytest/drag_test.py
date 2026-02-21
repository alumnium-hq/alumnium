from os import getenv

from pytest import mark

from alumnium import Alumni
from alumnium.tools import DragTool

driver_type = getenv("ALUMNIUM_DRIVER", "selenium")


@mark.xfail("appium" in driver_type, reason="Drag is not implemented in Appium yet")
def test_drag(al, driver, navigate):
    al = Alumni(
        driver,
        extra_tools=[DragTool],
    )

    navigate("slider.html")

    al.do("drag the slider to the right by 10 pixels")
    al.check("the slider value is greater than 50")

    al.do("drag the slider to the left by 10 pixels")
    al.check("the slider value is less than or equal to 50")
