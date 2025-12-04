"""Driver factory functions for different platforms."""

from os import getenv
from typing import Any


def create_chrome_driver(capabilities: dict[str, Any], server_url: str | None) -> Any:
    if getenv("ALUMNIUM_DRIVER", "selenium").lower() == "playwright":
        return create_playwright_driver(capabilities, server_url)
    else:
        return create_selenium_driver(capabilities, server_url)


def create_selenium_driver(capabilities: dict[str, Any], server_url: str | None) -> Any:
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
    import asyncio
    from threading import Thread

    from playwright.async_api import async_playwright

    from alumnium.drivers.async_playwright_driver import AsyncPlaywrightDriver

    # Create event loop in dedicated thread (shared by Playwright and driver)
    loop = asyncio.new_event_loop()
    thread = Thread(target=lambda: asyncio.set_event_loop(loop) or loop.run_forever(), daemon=True)
    thread.start()

    # Create Playwright resources in the shared event loop
    async def _create_resources():
        playwright = await async_playwright().start()

        # Get browser type from capabilities
        browser_type = capabilities.get("browserName", "chromium").lower()
        headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true").lower() == "true"

        # Launch browser
        if browser_type == "firefox":
            browser = await playwright.firefox.launch(headless=headless)
        elif browser_type == "webkit":
            browser = await playwright.webkit.launch(headless=headless)
        else:  # chromium (default)
            browser = await playwright.chromium.launch(headless=headless)

        # Create context and page
        context = await browser.new_context()
        page = await context.new_page()

        return playwright, browser, context, page

    # Run resource creation in the shared loop
    future = asyncio.run_coroutine_threadsafe(_create_resources(), loop)
    playwright, browser, context, page = future.result()

    # Create driver with the page and shared loop
    driver = AsyncPlaywrightDriver(page, loop)

    # Store references for cleanup
    driver._playwright_instance = playwright
    driver._browser_instance = browser
    driver._context_instance = context
    driver._thread = thread

    return driver
