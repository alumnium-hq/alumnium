from alumnium import Model
from pytest import mark, raises


def test_addition(al, driver):
    driver.get("https://seleniumbase.io/apps/calculator")
    al.do("1 + 1 =")
    al.check("calculator result is 2")
    # with raises(AssertionError):
    #     al.check("calculator result is 3")


def test_subtraction(al, driver):
    driver.get("https://seleniumbase.io/apps/calculator")
    al.do("5 - 3 =")
    al.check("calculator result is 2")
    # with raises(AssertionError):
    #     al.check("calculator result is 1")


def test_multiplication(al, driver):
    driver.get("https://seleniumbase.io/apps/calculator")
    al.do("3 * 4 =")
    al.check("calculator result is 12")
    # with raises(AssertionError):
    #     al.check("calculator result is 11")


def test_division(al, driver):
    driver.get("https://seleniumbase.io/apps/calculator")
    al.do("8 / 2 =")
    al.check("calculator result is 4")
    # with raises(AssertionError):
    #     al.check("calculator result is 5")
