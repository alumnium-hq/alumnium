def test_retries_assertion_on_loading_content(al, driver):
    driver.get("https://the-internet.herokuapp.com/dynamic_controls")
    al.check("text field is disabled")
    al.do("click Enable button")
    # It takes few seconds to enable the text field
    al.check("text field is enabled")