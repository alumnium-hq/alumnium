from alumnium import Model
from pytest import mark


def test_search(al, navigate):
    navigate("https://www.duckduckgo.com")  # Google forces reCAPTCHA
    al.do("search for selenium")
    al.check("selenium in page title")
    al.check("selenium.dev is present in the search results")
