from alumnium import Model
from pytest import mark, raises


@mark.xfail(Model.load() == Model.AWS_ANTHROPIC, reason="Bedrock version of Haiku is subpar")
@mark.xfail(Model.load() == Model.AWS_META, reason="It is too hard for Llama 3.2")
@mark.xfail(Model.load() == Model.GOOGLE, reason="It is too hard for Gemini 1.5 Flash (but works on Pro)")
def test_addition(al, driver):
    driver.get("https://seleniumbase.io/apps/calculator")
    al.do("1 + 1 =")
    al.check("calculator result is 2")
    with raises(AssertionError):
        al.check("calculator result is 3")
