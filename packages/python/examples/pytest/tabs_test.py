def test_autoswitch_to_tab(al, navigate):
    navigate("https://the-internet.herokuapp.com/windows")
    al.do("click on 'Click Here' link")
    assert al.get("header text") == "New Window"
