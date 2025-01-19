from pytest import raises


def test_addition(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("2 + 2 =")
    al.check("calculator result is 4")
    with raises(AssertionError):
        al.check("calculator result is 3")


def test_subtraction(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("5 - 3 =")
    al.check("calculator result is 2")


def test_multiplication(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("3 * 4 =")
    al.check("calculator result is 12")


def test_division(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("8 / 2 =")
    al.check("calculator result is 4")
