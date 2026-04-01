from os import getenv

from pytest import mark

from alumnium.tools import DragSliderTool

driver_type = getenv("ALUMNIUM_DRIVER", "selenium")


@mark.xfail("appium" in driver_type, reason="Drag slider is not implemented in Appium yet")
def test_drag_slider(al_factory, navigate):
    al = al_factory(extra_tools=[DragSliderTool])

    navigate("slider.html")

    al.do("drag the slider to 70")
    al.check("the slider value is 70")

    al.do("drag the slider to 33")
    al.check("the slider value is 33")
