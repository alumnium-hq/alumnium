from os import getenv

from pytest import mark, fixture

from alumnium import Model, Provider

alumnium_driver = getenv("ALUMNIUM_DRIVER", "selenium")

def test_area_screenshot_with_vision(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("2 + 3 =")
    al.area("Calculator Screen").check("showing output as 5", vision=True)
