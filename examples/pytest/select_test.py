from pytest import mark, raises

from alumnium import Model


@mark.xfail(Model.load() == Model.OLLAMA, reason="Poor instruction following")
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
