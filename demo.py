from alumnium import Alumni
from selenium.webdriver import Chrome

driver = Chrome()
al = Alumni(driver)

print(
    """
Welcome to the Alumnium interactive console!

Use the `al` object to interact with Alumni. For example:
    - al.do("search for selenium")
    - al.check("selenium.dev is present in the search results")

You can also use the `driver` object to interact with the Selenium directly.
    """
)
