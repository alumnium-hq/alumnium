from typing import TypeAlias

from appium.webdriver.webelement import WebElement as AppiumElement
from playwright.async_api import Locator as PlaywrightElementAsync
from playwright.sync_api import Locator as PlaywrightElement
from selenium.webdriver.remote.webelement import WebElement as SeleniumElement

Element: TypeAlias = AppiumElement | PlaywrightElement | PlaywrightElementAsync | SeleniumElement
