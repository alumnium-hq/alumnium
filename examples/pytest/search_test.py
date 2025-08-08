from os import getenv

from pytest import mark, raises

from alumnium import Model, Provider

alumnium_driver = getenv("ALUMNIUM_DRIVER", "selenium")
playwright_headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true")


@mark.skipif(
    alumnium_driver == "playwright" and playwright_headless == "true",
    reason="DuckDuckGo blocks headless browsers",
)
@mark.xfail(Model.current.provider == Provider.OLLAMA, reason="Poor instruction following")
def test_search(al, navigate):
    navigate("https://www.duckduckgo.com")  # Google forces reCAPTCH, so we use DuckDuckGo

    al.do("type 'selenium' into the search field, then press 'Enter'")
    if alumnium_driver != "appium":
        # DuckDuckGo doesn't change title on mobile browser
        al.check("page title contains selenium")

    assert al.get("atomic number") == 34

    al.check("search results contain selenium.dev")
    with raises(AssertionError):
        al.check("search results does not contain selenium.dev")
