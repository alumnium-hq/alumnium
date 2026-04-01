from pytest import mark

from alumnium import Model, Provider
from alumnium.tools import NavigateBackTool


@mark.xfail(Model.current.provider == Provider.MISTRALAI, reason="Needs more work")
def test_navigate_back_uses_history(al_factory, navigate):
    al = al_factory(extra_tools=[NavigateBackTool])

    navigate("https://the-internet.herokuapp.com")
    assert al.driver.url == "https://the-internet.herokuapp.com/"

    al.do("open typos")
    assert al.driver.url == "https://the-internet.herokuapp.com/typos"

    al.do("navigate back to the previous page")
    assert al.driver.url == "https://the-internet.herokuapp.com/"
