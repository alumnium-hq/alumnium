def test_drag_and_drop(al):
    al.act("open URL https://the-internet.herokuapp.com/drag_and_drop")
    al.assess("banner A is shown to the left from banner B")
    al.act("move banner A to banner B")
    al.assess("banner B is shown to the left from banner A")
