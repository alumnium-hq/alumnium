from os import getenv

from pytest import fixture, mark

from alumnium import Model, Provider


@fixture(autouse=True)
def learn(al):
    # These models double-click to sort
    if Model.current.provider in [
        Provider.ANTHROPIC,
        Provider.AWS_ANTHROPIC,
        Provider.GOOGLE,
        Provider.MISTRALAI,
    ]:
        al.learn(
            goal="sort by web site",
            actions=["click 'Web Site' header"],
        )
    yield
    al.clear_learn_examples()


@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium-ios",
    reason="Area is not propery extracted from Appium source code.",
)
def test_table_extraction(al, navigate):
    navigate("https://the-internet.herokuapp.com/tables")

    area = al.area("example 1 table")
    assert area.get("Jason Doe's due amount") == "$100.00"
    assert area.get("Frank Bach's due amount") == "$51.00"
    assert area.get("Tim Conway's due amount") == "$50.00"
    assert area.get("John Smith's due amount") == "$50.00"


@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium-ios",
    reason="Area is not propery extracted from Appium source code.",
)
def test_table_sorting(al, navigate):
    navigate("https://the-internet.herokuapp.com/tables")

    table1 = al.area("example 1 table - return table element")
    assert table1.get("first names") == ["John", "Frank", "Jason", "Tim"]
    assert table1.get("last names") == ["Smith", "Bach", "Doe", "Conway"]

    table2 = al.area("example 2 table - return table element")
    assert table2.get("first names") == ["John", "Frank", "Jason", "Tim"]
    assert table2.get("last names") == ["Smith", "Bach", "Doe", "Conway"]

    table1.do("sort by last name")
    table1 = al.area("example 1 table - return table element")  # refresh
    assert table1.get("first names") == ["Frank", "Tim", "Jason", "John"]
    assert table1.get("last names") == ["Bach", "Conway", "Doe", "Smith"]
    # example 2 table is not affected
    table2 = al.area("example 2 table - return table element")  # refresh
    assert table2.get("first names") == ["John", "Frank", "Jason", "Tim"]
    assert table2.get("last names") == ["Smith", "Bach", "Doe", "Conway"]

    table2.do("sort by first name")
    table2 = al.area("example 2 table - return table element")  # refresh
    assert table2.get("first names") == ["Frank", "Jason", "John", "Tim"]
    assert table2.get("last names") == ["Bach", "Doe", "Smith", "Conway"]
    # example 1 table is not affected
    table1 = al.area("example 1 table - return table element")  # refresh
    assert table1.get("first names") == ["Frank", "Tim", "Jason", "John"]
    assert table1.get("last names") == ["Bach", "Conway", "Doe", "Smith"]


def test_retrieval_of_unavailable_data(al, navigate):
    navigate("https://the-internet.herokuapp.com/tables")

    # This data is not available on the page.
    # Even though LLM knows the answer, it should not respond it.
    assert al.get("atomic number of Selenium") is None
