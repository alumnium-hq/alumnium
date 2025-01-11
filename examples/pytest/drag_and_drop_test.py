from os import getenv

from alumnium import Model
from pytest import mark


@mark.xfail(Model.load() == Model.AWS_META, reason="https://github.com/boto/boto3/issues/4374")
@mark.xfail(
    (Model.load() in [Model.ANTHROPIC, Model.AWS_ANTHROPIC]) and getenv("ALUMNIUM_DRIVER", "") == "playwright",
    reason="Strange error that only occurs in Playwright",
)
def test_drag_and_drop(al, navigate):
    navigate("https://the-internet.herokuapp.com/drag_and_drop")
    al.check("square A is positioned to the left of square B", vision=True)
    al.do("move square A to square B")
    al.check("square B is positioned to the left of square A", vision=True)
