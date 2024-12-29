from alumnium import Model
from pytest import mark


def test_select_option(al, driver):
    driver.get("https://the-internet.herokuapp.com/dropdown")
    al.check("Option 1 is not selected")
    al.check("Option 2 is not selected")
    al.do("select 'Option 1'")
    al.check("Option 1 is selected")
    al.check("Option 2 is not selected")
