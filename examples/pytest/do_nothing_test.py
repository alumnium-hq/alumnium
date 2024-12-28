def test_doing_nothing(al, driver):
    driver.get("https://the-internet.herokuapp.com/login")
    # This should not attempt to do anything on the page
    # because there are no relevant controls.
    al.do("select USA in Country")
    al.do("create task with title 'Buy milk'")
