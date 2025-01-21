from time import sleep

from alumnium import Model
from pytest import mark


@mark.xfail(Model.load() == Model.AWS_META, reason="https://github.com/boto/boto3/issues/4374")
def test_drag_and_drop(al, navigate):
    navigate("https://the-internet.herokuapp.com/drag_and_drop")
    assert al.get("square titles ordered from left to right", vision=True) == ["A", "B"]
    al.do("move square A to square B")
    sleep(1)
    assert al.get("square titles ordered from left to right", vision=True) == ["B", "A"]
