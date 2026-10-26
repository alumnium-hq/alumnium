from typing import cast

from selenium.webdriver.remote.webdriver import WebDriver

from alumnium.drivers.selenium.bidi_driver import BiDiDriver
from alumnium.drivers.selenium.cdp_driver import CdpDriver
from alumnium.drivers.selenium_driver import SeleniumDriver


def test_creates_cdp_driver_for_chromium_browsers(monkeypatch):
    monkeypatch.setattr(CdpDriver, "__init__", lambda self, driver: None)

    class Driver:
        capabilities = {"browserName": "chrome"}

    driver = SeleniumDriver.of(cast(WebDriver, Driver()))

    assert isinstance(driver, CdpDriver)
    assert driver.platform == "chromium"


def test_creates_bidi_driver_for_firefox(monkeypatch):
    monkeypatch.setattr(BiDiDriver, "__init__", lambda self, driver: None)

    class Driver:
        capabilities = {"browserName": "firefox"}

    driver = SeleniumDriver.of(cast(WebDriver, Driver()))

    assert isinstance(driver, BiDiDriver)
    assert driver.platform == "firefox"
