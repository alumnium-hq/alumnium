import pytest


def test_addition(al, driver):
    driver.get("https://seleniumbase.io/apps/calculator")
    al.act("1 + 1 =")
    al.verify("calculator result is 2")
    with pytest.raises(AssertionError):
        al.verify("calculator result is 3")
