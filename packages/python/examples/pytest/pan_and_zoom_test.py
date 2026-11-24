import re
from os import getenv

from pytest import mark

from alumnium.tools import PanInDirectionTool, ZoomTool

unsupported_on_appium = mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Not supported on Appium driver yet",
)


def number(al, what: str) -> int:
    value = al.get(what)
    match = re.search(r"-?\d+", str(value))
    assert match, f"No number in {value!r}"
    return int(match.group())


@unsupported_on_appium
def test_pan_map_in_each_direction(al_factory, navigate):
    al = al_factory(extra_tools=[PanInDirectionTool])
    navigate("pannable_map.html")
    assert number(al, "east value of the map center") == 0
    al.do("pan the map left")
    assert number(al, "east value of the map center") < 0
    al.do("pan the map right")
    assert number(al, "east value of the map center") == 0
    al.do("pan the map up")
    assert number(al, "north value of the map center") > 0


@unsupported_on_appium
def test_zoom_map_in_and_out(al_factory, navigate):
    al = al_factory(extra_tools=[ZoomTool])
    navigate("pannable_map.html")
    al.do("zoom in the map")
    assert number(al, "zoom level of the map") == 11
    al.do("zoom out the map")
    al.do("zoom out the map")
    assert number(al, "zoom level of the map") == 9
