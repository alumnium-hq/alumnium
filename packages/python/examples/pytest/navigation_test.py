from urllib.parse import urljoin

import pytest

from alumnium import Provider
from alumnium.tools import NavigateBackTool


def test_navigate_back_uses_history(al_factory, navigate):
    al = al_factory(extra_tools=[NavigateBackTool])
    if al.model.provider == Provider.MISTRALAI:
        pytest.xfail("Needs more work")

    navigate("the-internet/index.html")
    index_url = al.driver.url
    assert index_url.endswith("/the-internet/index.html")

    al.do("open typos")
    assert al.driver.url == urljoin(index_url, "typos.html")

    al.do("navigate back to the previous page")
    assert al.driver.url == index_url
