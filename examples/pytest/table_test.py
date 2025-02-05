from alumnium import Model
from pytest import mark


def test_table_extraction(al, navigate):
    navigate("https://the-internet.herokuapp.com/tables")

    assert al.get("Jason Doe's due amount from example 1 table") == "$100.00"
    assert al.get("Frank Bach's due amount from example 1 table") == "$51.00"
    assert al.get("Tim Conway's due amount from example 1 table") == "$50.00"
    assert al.get("John Smith's due amount from example 1 table") == "$50.00"


@mark.xfail(
    Model.load() == Model.AWS_META,
    reason="Needs more work because `do` produces duplicated actions",
)
def test_table_sorting(al, navigate):
    navigate("https://the-internet.herokuapp.com/tables")

    assert al.get("first names from example 1 table") == ["John", "Frank", "Jason", "Tim"]
    assert al.get("last names from example 1 table") == ["Smith", "Bach", "Doe", "Conway"]
    assert al.get("first names from example 2 table") == ["John", "Frank", "Jason", "Tim"]
    assert al.get("last names from example 2 table") == ["Smith", "Bach", "Doe", "Conway"]

    al.do("sort example 1 table by last name")
    assert al.get("first names from example 1 table") == ["Frank", "Tim", "Jason", "John"]
    assert al.get("last names from example 1 table") == ["Bach", "Conway", "Doe", "Smith"]
    # example 2 table is not affected
    assert al.get("first names from example 2 table") == ["John", "Frank", "Jason", "Tim"]
    assert al.get("last names from example 2 table") == ["Smith", "Bach", "Doe", "Conway"]

    al.do("sort example 2 table by first name")
    assert al.get("first names from example 2 table") == ["Frank", "Jason", "John", "Tim"]
    assert al.get("last names from example 2 table") == ["Bach", "Doe", "Smith", "Conway"]
    # example 1 table is not affected
    assert al.get("first names from example 1 table") == ["Frank", "Tim", "Jason", "John"]
    assert al.get("last names from example 1 table") == ["Bach", "Conway", "Doe", "Smith"]
