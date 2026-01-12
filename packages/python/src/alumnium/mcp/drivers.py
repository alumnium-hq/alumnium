"""Driver factory functions for different platforms."""

from os import getenv
from pathlib import Path
from typing import Any

from ..server.logutils import get_logger

logger = get_logger(__name__)


def create_chrome_driver(capabilities: dict[str, Any], server_url: str | None, artifacts_dir: Path) -> Any:
    driver_type = getenv("ALUMNIUM_DRIVER", "selenium").lower()
    logger.info(f"Creating Chrome driver using {driver_type}")
    if driver_type == "playwright":
        return create_playwright_driver(capabilities, artifacts_dir)
    else:
        return create_selenium_driver(capabilities, server_url)


def create_playwright_driver(capabilities: dict[str, Any], artifacts_dir: Path) -> Any:
    """Create async Playwright driver from capabilities."""
    import asyncio
    from threading import Thread

    from playwright.async_api import async_playwright

    headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true").lower() == "true"
    logger.info(f"Creating Playwright driver (headless={headless})")

    # Create event loop in dedicated thread (shared by Playwright and driver)
    loop = asyncio.new_event_loop()
    thread = Thread(target=lambda: asyncio.set_event_loop(loop) or loop.run_forever(), daemon=True)
    thread.start()

    # Create Playwright resources in the shared event loop
    async def _create_resources():
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(headless=headless)

        headers = capabilities.get("headers", {})
        if headers:
            logger.debug(f"Setting extra HTTP headers: {headers}")

        context = await browser.new_context(
            record_video_dir=artifacts_dir / "videos",
            extra_http_headers=headers,
        )

        await context.tracing.start(screenshots=True, snapshots=True, sources=True)

        cookies = capabilities.get("cookies", [])
        if cookies:
            logger.debug(f"Adding cookies: {cookies}")
            for cookie in cookies:
                if "path" not in cookie:
                    cookie["path"] = "/"
            await context.add_cookies(cookies)

        page = await context.new_page()

        return page

    # Run resource creation in the shared loop
    future = asyncio.run_coroutine_threadsafe(_create_resources(), loop)
    page = future.result()
    logger.debug("Playwright driver created successfully")
    return (page, loop)


def create_selenium_driver(capabilities: dict[str, Any], server_url: str | None) -> Any:
    """Create Selenium Chrome driver from capabilities."""
    from selenium.webdriver.chrome.options import Options

    logger.info(f"Creating Selenium driver (server_url={server_url or 'local'})")

    headers = capabilities.pop("headers", {})
    cookies = capabilities.pop("cookies", [])
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

    if headers or cookies:
        driver.execute_cdp_cmd("Network.enable", {})  # type: ignore[reportAttributeAccessIssue]

    if headers:
        logger.debug(f"Setting extra HTTP headers: {list(headers.keys())}")
        driver.execute_cdp_cmd("Network.setExtraHTTPHeaders", {"headers": headers})  # type: ignore[reportAttributeAccessIssue]

    if cookies:
        logger.debug(f"Adding {len(cookies)} cookie(s)")
        driver.execute_cdp_cmd("Network.setCookies", {"cookies": cookies})  # type: ignore[reportAttributeAccessIssue]

    logger.debug("Selenium driver created successfully")
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

    logger.info(f"Creating iOS driver (server={remote_server})")

    # Set up Appium client config
    client_config = AppiumClientConfig(
        username=getenv("LT_USERNAME"),
        password=getenv("LT_ACCESS_KEY"),
        remote_server_addr=remote_server,
        direct_connection=True,
    )

    # Create Appium driver
    driver = Appium(client_config=client_config, options=options)

    logger.debug("iOS driver created successfully")
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

    logger.info(f"Creating Android driver (server={remote_server})")

    # Set up Appium client config
    client_config = AppiumClientConfig(
        username=getenv("LT_USERNAME"),
        password=getenv("LT_ACCESS_KEY"),
        remote_server_addr=remote_server,
        direct_connection=True,
    )

    # Create Appium driver
    driver = Appium(client_config=client_config, options=options)

    logger.debug("Android driver created successfully")
    return driver
