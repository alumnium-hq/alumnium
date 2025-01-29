from pytest import raises


def test_search(al, navigate):
    navigate("https://www.duckduckgo.com")  # Google forces reCAPTCHA
    al.do("search for selenium")
    al.check("selenium in page title")
    al.check("selenium.dev is present in the search results")
    with raises(AssertionError):
        al.check("selenium.dev is not present in the search results")
