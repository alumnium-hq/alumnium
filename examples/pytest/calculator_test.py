from pytest import raises


def test_addition(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("2 + 2 =")
    assert al.get("calculator value") == 4


def test_subtraction(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("5 - 3 =")
    assert al.get("calculator value") == 2


def test_multiplication(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("3 * 4 =")
    assert al.get("calculator value") == 12


def test_division(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("8 / 2 =")
    assert al.get("calculator value") == 4
