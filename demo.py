from os import getenv

from playwright.sync_api import sync_playwright
from selenium.webdriver import Chrome

from alumnium import Alumni

if getenv("ALUMNIUM_DRIVER", "selenium") == "playwright":
    playwright = sync_playwright().start()
    headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true").lower() == "true"
    page = playwright.chromium.launch(headless=headless).new_page()
    message = "`page` object to interact with Playwright directly"
    al = Alumni(page)
else:
    driver = Chrome()
    al = Alumni(driver)
    message = "`driver` object to interact with Selenium directly"


print(
    f"""
Welcome to the Alumnium interactive console!

Use the `al` object to interact with Alumni. For example:
    - al.do("search for selenium")
    - al.check("search results contain selenium.dev")
    - al.get("atomic number")

You can also use {message}.
    """
)
