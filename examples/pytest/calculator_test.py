def test_addition(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("2 + 2 =")
    assert al.get("calculator value") == 4
