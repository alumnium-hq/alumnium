from alumnium import Model
from pytest import mark


@mark.xfail(Model.load() == Model.AWS_ANTHROPIC, reason="Bedrock version of Haiku is subpar")
@mark.xfail(Model.load() == Model.AWS_META, reason="https://github.com/langchain-ai/langchain-aws/issues/285")
def test_drag_and_drop(al, driver):
    driver.get("https://the-internet.herokuapp.com/drag_and_drop")
    al.check("square A is positioned to the left of square B", vision=True)
    al.do("move square A to square B")
    al.check("square B is positioned to the left of square A", vision=True)
