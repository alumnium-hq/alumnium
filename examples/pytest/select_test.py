from os import getenv

from pytest import mark, raises

from alumnium import Model, Provider


@mark.xfail(Model.current.provider == Provider.OLLAMA, reason="Poor instruction following")
@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium",
    reason="Appium doesn't support select tool yet",
)
def test_select_option(al, navigate):
    navigate("https://the-internet.herokuapp.com/dropdown")

    al.check("Option 1 is not selected")
    with raises(AssertionError):
        al.check("Option 1 is selected")

    al.check("Option 2 is not selected")
    with raises(AssertionError):
        al.check("Option 2 is selected")

    al.do("select 'Option 1'")

    al.check("Option 1 is selected")
    with raises(AssertionError):
        al.check("Option 1 is not selected")

    al.check("Option 2 is not selected")
    with raises(AssertionError):
        al.check("Option 2 is selected")
