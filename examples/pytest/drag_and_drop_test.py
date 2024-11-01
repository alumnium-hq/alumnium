def test_drag_and_drop(al, driver):
    driver.get("https://the-internet.herokuapp.com/drag_and_drop")
    al.check("square A is positioned to the left from square B", vision=True)
    al.do("move square A to square B")
    al.check("square B is positioned to the left from square A", vision=True)
