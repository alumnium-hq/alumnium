from alumnium import Model
from pytest import mark


@mark.xfail(Model.load() == Model.AWS_META, reason="Llama needs more work")
def test_search(al, navigate):
    navigate("https://www.duckduckgo.com")  # Google forces reCAPTCHA
    al.do("search for selenium")
    al.check("selenium in page title")
    al.check("selenium.dev is present in the search results")
