def test_locator(al, navigate, type):
    navigate("https://bonigarcia.dev/selenium-webdriver-java/web-form.html")

    text_input = al.find("text input")
    assert text_input is not None
    type(text_input, "Hello Alumnium!")

    textarea = al.find("textarea")
    assert textarea is not None
    type(textarea, "Testing the LocatorAgent")

    submit_button = al.find("submit button")
    assert submit_button is not None
    submit_button.click()
