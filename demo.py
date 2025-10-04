from os import getenv

from playwright.sync_api import sync_playwright
from selenium.webdriver import Chrome

from alumnium import Alumni

if getenv("ALUMNIUM_DRIVER", "selenium") == "playwright":
    playwright = sync_playwright().start()
    headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true").lower() == "true"
    driver = playwright.chromium.launch(headless=headless).new_page()
    page = driver
    message = "`page` object to interact with Playwright directly"
else:
    driver = Chrome()
    message = "`driver` object to interact with Selenium directly"

al = Alumni(driver, url=getenv("ALUMNIUM_SERVER_URL", None))

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
