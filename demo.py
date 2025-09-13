from selenium.webdriver import Chrome

from alumnium import Alumni

driver = Chrome()
al = Alumni(driver)

print(
    """
Welcome to the Alumnium interactive console!

First, try to open some page with `driver` object:
    driver.get("https://duckduckgo.com/")

Then, Use the `al` object to interact with Alumni. For example:
    al.do("search for selenium")
    al.check("search results contain selenium.dev")
    al.get("atomic number")

You can also use the `driver` object to interact with the Selenium directly.
    """
)
