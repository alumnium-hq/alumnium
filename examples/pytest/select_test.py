def test_select_option(al, driver):
    driver.get("https://the-internet.herokuapp.com/dropdown")
    al.verify("no option is selected")
    al.act("select Option 1")
    al.verify("Option 1 is selected")
