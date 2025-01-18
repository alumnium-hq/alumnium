def test_google_search(al, navigate):
    navigate("https://www.duckduckgo.com")  # TODO: captcha
    al.do("search for selenium")
    al.check("selenium in page title")
    al.check("selenium.dev is present in the search results")
