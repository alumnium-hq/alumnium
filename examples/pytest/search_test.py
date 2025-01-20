from alumnium import Model
from pytest import mark


def test_search(al, navigate):
    navigate("https://www.duckduckgo.com")  # Google forces reCAPTCHA
    al.do("search for selenium")
    al.check("selenium in page title")
    assert "https://www.selenium.dev/" in al.get("search results URLs", list[str])
