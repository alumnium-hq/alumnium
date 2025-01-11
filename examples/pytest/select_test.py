from os import getenv

from alumnium import Model
from pytest import mark


@mark.xfail(
    (Model.load() in [Model.ANTHROPIC, Model.AWS_ANTHROPIC]) and getenv("ALUMNIUM_DRIVER", "") == "playwright",
    reason="Playwright has no way to select option itself",
)
def test_select_option(al, navigate):
    navigate("https://the-internet.herokuapp.com/dropdown")
    al.check("Option 1 is not selected")
    al.check("Option 2 is not selected")
    al.do("select 'Option 1'")
    al.check("Option 1 is selected")
    al.check("Option 2 is not selected")
