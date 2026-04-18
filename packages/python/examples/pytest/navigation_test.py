import pytest

from alumnium import Provider
from alumnium.tools import NavigateBackTool


def test_navigate_back_uses_history(al_factory, navigate):
    al = al_factory(extra_tools=[NavigateBackTool])
    if al.model.provider == Provider.MISTRALAI:
        pytest.xfail("Needs more work")

    navigate("https://the-internet.herokuapp.com")
    assert al.driver.url == "https://the-internet.herokuapp.com/"

    al.do("open typos")
    assert al.driver.url == "https://the-internet.herokuapp.com/typos"

    al.do("navigate back to the previous page")
    assert al.driver.url == "https://the-internet.herokuapp.com/"
