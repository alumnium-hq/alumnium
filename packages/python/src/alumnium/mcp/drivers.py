"""Driver factory functions for different platforms."""

from os import getenv
from typing import Any


def create_chromium_driver(capabilities: dict[str, Any], server_url: str | None) -> Any:
    """Create Selenium Chrome driver from capabilities."""
    from selenium.webdriver.chrome.options import Options

    options = Options()

    # Apply all capabilities to options
    for key, value in capabilities.items():
        if key != "platformName":
            options.set_capability(key, value)

    # Use Remote driver if server_url provided, otherwise local Chrome
    if server_url:
        from selenium.webdriver import Remote

        driver = Remote(command_executor=server_url, options=options)
    else:
        from selenium.webdriver import Chrome

        driver = Chrome(options=options)

    return driver


def create_ios_driver(capabilities: dict[str, Any], server_url: str | None) -> Any:
    """Create Appium iOS driver from capabilities."""
    from appium.options.ios import XCUITestOptions
    from appium.webdriver.client_config import AppiumClientConfig
    from appium.webdriver.webdriver import WebDriver as Appium

    options = XCUITestOptions()

    # Load capabilities into options
    options.load_capabilities(capabilities)

    # Determine server URL: parameter > env var > default
    if server_url:
        remote_server = server_url
    else:
        remote_server = getenv("ALUMNIUM_APPIUM_SERVER", "http://localhost:4723")

    # Set up Appium client config
    client_config = AppiumClientConfig(
        username=getenv("LT_USERNAME"),
        password=getenv("LT_ACCESS_KEY"),
        remote_server_addr=remote_server,
        direct_connection=True,
    )

    # Create Appium driver
    driver = Appium(client_config=client_config, options=options)

    return driver


def create_android_driver(capabilities: dict[str, Any], server_url: str | None) -> Any:
    """Create Appium Android driver from capabilities."""
    from appium.options.android import UiAutomator2Options
    from appium.webdriver.client_config import AppiumClientConfig
    from appium.webdriver.webdriver import WebDriver as Appium

    options = UiAutomator2Options()

    # Load capabilities into options
    options.load_capabilities(capabilities)

    # Determine server URL: parameter > env var > default
    if server_url:
        remote_server = server_url
    else:
        remote_server = getenv("ALUMNIUM_APPIUM_SERVER", "http://localhost:4723")

    # Set up Appium client config
    client_config = AppiumClientConfig(
        username=getenv("LT_USERNAME"),
        password=getenv("LT_ACCESS_KEY"),
        remote_server_addr=remote_server,
        direct_connection=True,
    )

    # Create Appium driver
    return Appium(client_config=client_config, options=options)


def create_playwright_driver(capabilities: dict[str, Any], server_url: str | None) -> Any:
    """Create async Playwright driver from capabilities."""
    from alumnium.drivers.async_playwright_driver import AsyncPlaywrightDriver

    # Create driver - initialization happens in background thread
    return AsyncPlaywrightDriver(capabilities)
