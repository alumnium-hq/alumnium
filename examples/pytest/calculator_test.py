import pytest


def test_addition(al, driver):
    driver.get("https://seleniumbase.io/apps/calculator")
    al.do("1 + 1 =")
    al.check("calculator result is 2")
    with pytest.raises(AssertionError):
        al.check("calculator result is 3")
