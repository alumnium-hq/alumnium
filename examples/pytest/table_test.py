from os import getenv

from pytest import mark


@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium",
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
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium",
    reason="Area is not propery extracted from Appium source code.",
)
def test_table_sorting(al, navigate):
    navigate("https://the-internet.herokuapp.com/tables")

    table1 = al.area("example 1 table")
    assert set(table1.get("first names")) == {"John", "Frank", "Jason", "Tim"}
    assert set(table1.get("last names")) == {"Smith", "Bach", "Doe", "Conway"}

    table2 = al.area("example 2 table")
    assert set(table2.get("first names")) == {"John", "Frank", "Jason", "Tim"}
    assert set(table2.get("last names")) == {"Smith", "Bach", "Doe", "Conway"}

    table1.do("sort by last name")
    assert set(table1.get("first names")) == {"Frank", "Tim", "Jason", "John"}
    assert set(table1.get("last names")) == {"Bach", "Conway", "Doe", "Smith"}
    # example 2 table is not affected
    assert set(table2.get("first names")) == {"John", "Frank", "Jason", "Tim"}
    assert set(table2.get("last names")) == {"Smith", "Bach", "Doe", "Conway"}

    table2.do("sort example 2 table by first name")
    assert set(table2.get("first names")) == {"Frank", "Jason", "John", "Tim"}
    assert set(table2.get("last names")) == {"Bach", "Doe", "Smith", "Conway"}
    # example 1 table is not affected
    assert set(table1.get("first names")) == {"Frank", "Tim", "Jason", "John"}
    assert set(table1.get("last names")) == {"Bach", "Conway", "Doe", "Smith"}


def test_retrieval_of_unavailable_data(al, navigate):
    navigate("https://the-internet.herokuapp.com/tables")

    # This data is not available on the page.
    # Even though LLM knows the answer, it should not respond it.
    assert al.get("atomic number of Selenium") is None
