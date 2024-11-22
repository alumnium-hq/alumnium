from alumnium import Model
from pytest import mark, raises


@mark.xfail(Model.load() == Model.AWS_ANTHROPIC, "Bedrock version of Haiku is subpar")
@mark.xfail(Model.load() == Model.AWS_META, "It is too hard for Llama 3.2")
def test_addition(al, driver):
    driver.get("https://seleniumbase.io/apps/calculator")
    al.do("1 + 1 =")
    al.check("calculator result is 2")
    with raises(AssertionError):
        al.check("calculator result is 3")
