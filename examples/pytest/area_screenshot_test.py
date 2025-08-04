from os import getenv

from pytest import fixture, mark

from alumnium import Model, Provider

alumnium_driver = getenv("ALUMNIUM_DRIVER", "selenium")

def test_area_screenshot_with_vision(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("2 + 3 =")
    al.area("output of the calculator screen app").check("output of the calculator app should be 5", vision=True)
    al.do("18 - 8 =")
    al.area("output of the calculator screen app").check("output of the calculator app should be 10", vision=True)
