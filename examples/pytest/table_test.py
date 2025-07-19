from os import getenv

from pytest import fixture, mark

from alumnium import Model, Provider


@fixture(autouse=True)
def learn(al):
    al.learn(
        "sort payments table by amount",
        ["click header 'Amount' in 'payments' table"],
    )
    yield
    al.clear_examples()


@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium",
    reason="Investigate why extraction is not stable",
)
def test_table_extraction(al, navigate):
    navigate("https://the-internet.herokuapp.com/tables")

    assert al.get("Jason Doe's due amount from example 1 table") == "$100.00"
    assert al.get("Frank Bach's due amount from example 1 table") == "$51.00"
    assert al.get("Tim Conway's due amount from example 1 table") == "$50.00"
    assert al.get("John Smith's due amount from example 1 table") == "$50.00"


@mark.xfail(
    Model.current.provider == Provider.AWS_META,
    reason="Needs more work because `do` produces duplicated actions",
)
@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium",
    reason="Investigate why extraction is not stable",
)
def test_table_sorting(al, navigate):
    navigate("https://the-internet.herokuapp.com/tables")

    assert al.get("first names from example 1 table") == [
        "John",
        "Frank",
        "Jason",
        "Tim",
    ]
    assert al.get("last names from example 1 table") == [
        "Smith",
        "Bach",
        "Doe",
        "Conway",
    ]
    assert al.get("first names from example 2 table") == [
        "John",
        "Frank",
        "Jason",
        "Tim",
    ]
    assert al.get("last names from example 2 table") == [
        "Smith",
        "Bach",
        "Doe",
        "Conway",
    ]

    al.do("sort example 1 table by last name")
    assert al.get("first names from example 1 table") == [
        "Frank",
        "Tim",
        "Jason",
        "John",
    ]
    assert al.get("last names from example 1 table") == [
        "Bach",
        "Conway",
        "Doe",
        "Smith",
    ]
    # example 2 table is not affected
    assert al.get("first names from example 2 table") == [
        "John",
        "Frank",
        "Jason",
        "Tim",
    ]
    assert al.get("last names from example 2 table") == [
        "Smith",
        "Bach",
        "Doe",
        "Conway",
    ]

    al.do("sort example 2 table by first name")
    assert al.get("first names from example 2 table") == [
        "Frank",
        "Jason",
        "John",
        "Tim",
    ]
    assert al.get("last names from example 2 table") == [
        "Bach",
        "Doe",
        "Smith",
        "Conway",
    ]
    # example 1 table is not affected
    assert al.get("first names from example 1 table") == [
        "Frank",
        "Tim",
        "Jason",
        "John",
    ]
    assert al.get("last names from example 1 table") == [
        "Bach",
        "Conway",
        "Doe",
        "Smith",
    ]


def test_retrieval_of_unavailable_data(al, navigate):
    navigate("https://the-internet.herokuapp.com/tables")

    # This data is not available on the page.
    # Even though LLM knows the answer, it should not respond it.
    assert al.get("atomic number of Selenium") is None


def test_table_data(al, navigate):
    navigate("https://seleniumbase.io/apps/table")
    data = al.get("table data")
    assert len(data) > 0
    assert "Name" in str(data)
