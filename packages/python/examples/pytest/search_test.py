from os import getenv

import pytest
from pytest import mark, raises

from alumnium import Provider

alumnium_driver = getenv("ALUMNIUM_DRIVER", "selenium")
playwright_headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true")


@mark.skipif(
    alumnium_driver == "playwright" and playwright_headless == "true",
    reason="DuckDuckGo blocks headless browsers",
)
def test_search(al, navigate):
    if al.get_model().provider == Provider.OLLAMA:
        pytest.xfail("Poor instruction following")

    navigate("https://search.brave.com")

    al.do("type 'selenium' into the search field, then press 'Enter'")
    al.check("page title contains selenium")

    assert al.get("atomic number") == 34

    al.check("search results contain selenium.dev")
    with raises(AssertionError):
        al.check("search results do not contain selenium.dev")
