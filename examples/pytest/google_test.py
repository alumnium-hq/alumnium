def test_google_search(al, navigate):
    navigate("https://www.google.com")
    al.do("search for selenium")
    al.check("selenium in page title")
    al.check("selenium.dev is present in the search results")
