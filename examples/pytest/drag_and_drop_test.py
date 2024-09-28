def test_drag_and_drop(al, driver):
    driver.get("https://the-internet.herokuapp.com/drag_and_drop")
    al.verify("square A is positioned to the left from square B")
    al.act("move square A to square B")
    al.verify("square B is positioned to the left from square A")
