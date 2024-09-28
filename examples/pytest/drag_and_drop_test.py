def test_drag_and_drop(al, driver):
    driver.get("https://the-internet.herokuapp.com/drag_and_drop")
    al.verify("banner A is shown to the left from banner B")
    al.act("move banner 'A' to banner 'B'")
    al.verify("banner B is shown to the left from banner A")
