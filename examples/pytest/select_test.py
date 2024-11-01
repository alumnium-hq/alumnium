def test_select_option(al, driver):
    driver.get("https://the-internet.herokuapp.com/dropdown")
    al.check("no option is selected")
    al.do("select Option 1")
    al.check("Option 1 is selected")
