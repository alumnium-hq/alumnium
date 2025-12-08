"""Driver factory functions for different platforms."""

from os import getenv
from pathlib import Path
from typing import Any


def create_chrome_driver(capabilities: dict[str, Any], server_url: str | None, screenshot_dir: Path) -> Any:
    if getenv("ALUMNIUM_DRIVER", "selenium").lower() == "playwright":
        return create_playwright_driver(capabilities, screenshot_dir)
    else:
        return create_selenium_driver(capabilities, server_url)


def create_playwright_driver(capabilities: dict[str, Any], screenshot_dir: Path) -> Any:
    """Create async Playwright driver from capabilities."""
    import asyncio
    from threading import Thread

    from playwright.async_api import async_playwright

    # Create event loop in dedicated thread (shared by Playwright and driver)
    loop = asyncio.new_event_loop()
    thread = Thread(target=lambda: asyncio.set_event_loop(loop) or loop.run_forever(), daemon=True)
    thread.start()

    # Create Playwright resources in the shared event loop
    async def _create_resources():
        playwright = await async_playwright().start()
        headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true").lower() == "true"
        browser = await playwright.chromium.launch(headless=headless)
        context = await browser.new_context(
            record_video_dir=screenshot_dir / "videos",
            extra_http_headers=capabilities.get("headers", {}),
        )

        await context.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = await context.new_page()

        return page

    # Run resource creation in the shared loop
    future = asyncio.run_coroutine_threadsafe(_create_resources(), loop)
    page = future.result()
    return (page, loop)


def create_selenium_driver(capabilities: dict[str, Any], server_url: str | None) -> Any:
    """Create Selenium Chrome driver from capabilities."""
    from selenium.webdriver.chrome.options import Options

    headers = capabilities.pop("headers", {})
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

    if headers:
        driver.execute_cdp_cmd("Network.enable", {})  # type: ignore[reportAttributeAccessIssue]
        driver.execute_cdp_cmd("Network.setExtraHTTPHeaders", {"headers": headers})  # type: ignore[reportAttributeAccessIssue]

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
