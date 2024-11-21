from alumnium import Model
from pytest import mark


@mark.xfail(Model.load() == Model.AWS_ANTHROPIC, reason="Bedrock version of Haiku is subpar")
@mark.xfail(
    Model.load() == Model.AWS_META,
    reason="Bedrock Llama 3.2 doesn't support vision and structured output at the same time",
)
def test_drag_and_drop(al, driver):
    driver.get("https://the-internet.herokuapp.com/drag_and_drop")
    al.check("square A is positioned to the left of square B", vision=True)
    al.do("move square A to square B")
    al.check("square B is positioned to the left of square A", vision=True)
