from datetime import datetime
from os import getenv

from appium.options.android import UiAutomator2Options
from appium.options.ios import XCUITestOptions
from appium.webdriver.client_config import AppiumClientConfig
from appium.webdriver.webdriver import WebDriver as Appium
from dotenv import load_dotenv
from playwright.sync_api import Page, sync_playwright
from pytest import fixture, hookimpl
from selenium.webdriver import Chrome
from selenium.webdriver.chrome.options import Options as ChromeOptions

from alumnium import Alumni, Model
from alumnium.drivers.appium_driver import AppiumDriver

load_dotenv()

driver_type = getenv("ALUMNIUM_DRIVER", "selenium")
headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true")


@fixture(scope="session")
def driver():
    if driver_type == "playwright":
        with sync_playwright() as playwright:
            is_headless = headless.lower() == "true"
            browser = playwright.chromium.launch(headless=is_headless)
            context = browser.new_context(record_video_dir="reports/videos/")
            context.tracing.start(screenshots=True, snapshots=True)
            page = context.new_page()
            yield page
            context.tracing.stop(path="reports/traces/pytest.zip")
    elif driver_type == "selenium":
        options = ChromeOptions()
        options.add_experimental_option(
            "prefs",
            {
                "credentials_enable_service": False,
                "profile.password_manager_enabled": False,
                "profile.password_manager_leak_detection": False,
            },
        )
        driver = Chrome(options=options)
        yield driver
    elif driver_type == "appium-ios":
        options = XCUITestOptions()
        options.automation_name = "XCUITest"
        options.device_name = "iPhone 16"
        options.platform_name = "iOS"
        options.no_reset = True

        lt_username = getenv("LT_USERNAME", None)
        lt_access_key = getenv("LT_ACCESS_KEY", None)

        if lt_username and lt_access_key:
            options.browser_name = "Safari"
            options.platform_version = "18"
            options.set_capability(
                "lt:options",
                {
                    "build": "Python - iOS",
                    "name": f"Pytest ({Model.current.provider.value}/{Model.current.name}) ",
                    "isRealMobile": True,
                    "network": False,
                    "visual": True,
                    "video": True,
                    "w3c": True,
                },
            )

            client_config = AppiumClientConfig(
                username=lt_username,
                password=lt_access_key,
                remote_server_addr="https://mobile-hub.lambdatest.com/wd/hub",
                direct_connection=True,
            )
        else:
            options.bundle_id = "com.apple.mobilesafari"
            options.platform_version = "18.4"
            options.new_command_timeout = 300

            client_config = AppiumClientConfig(
                remote_server_addr="http://localhost:4723/wd/hub",
                direct_connection=True,
            )

        driver = Appium(client_config=client_config, options=options)

        yield driver
    elif driver_type == "appium-android":
        options = UiAutomator2Options()
        options.automation_name = "UiAutomator2"
        options.device_name = "Android Device"
        options.platform_name = "Android"
        options.no_reset = True

        lt_username = getenv("LT_USERNAME", None)
        lt_access_key = getenv("LT_ACCESS_KEY", None)

        if lt_username and lt_access_key:
            options.browser_name = "Chrome"
            options.platform_version = "14"
            options.set_capability(
                "lt:options",
                {
                    "build": "Python - Android",
                    "name": f"Pytest ({Model.current.provider.value}/{Model.current.name})",
                    "isRealMobile": True,
                    "network": False,
                    "visual": True,
                    "video": True,
                    "w3c": True,
                },
            )

            client_config = AppiumClientConfig(
                username=lt_username,
                password=lt_access_key,
                remote_server_addr="https://mobile-hub.lambdatest.com/wd/hub",
                direct_connection=True,
            )
        else:
            options.platform_version = "14.0"
            options.new_command_timeout = 300

            client_config = AppiumClientConfig(
                remote_server_addr="http://localhost:4723/wd/hub",
                direct_connection=True,
            )

        driver = Appium(client_config=client_config, options=options)

        yield driver
    else:
        raise NotImplementedError(f"Driver {driver_type} not implemented")


@fixture(scope="session")
def al(driver):
    al = Alumni(driver, url=getenv("ALUMNIUM_SERVER_URL", None))
    if isinstance(al.driver, AppiumDriver):
        al.driver.delay = 0.1

    yield al
    al.quit()


@fixture
def navigate(al):
    return lambda url: al.driver.visit(url)


@fixture
def execute_script(al):
    return lambda script: al.driver.execute_script(script)


@fixture
def type(driver):
    def __type(element, text):
        if isinstance(driver, (Appium, Chrome)):
            element.send_keys(text)
        elif isinstance(driver, Page):
            element.fill(text)

    return __type


@hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item):
    timestamp = datetime.now().strftime("%H-%M-%S")
    pytest_html = item.config.pluginmanager.getplugin("html")
    outcome = yield
    report = outcome.get_result()
    extras = getattr(report, "extras", [])
    if report.when == "call":
        # Add screenshot and URL to the report
        al = item.funcargs["al"]
        driver = item.funcargs["driver"]

        if isinstance(driver, (Appium, Chrome)):
            driver.save_screenshot(f"reports/screenshot-{timestamp}.png")
        elif isinstance(driver, Page):
            driver.screenshot(path=f"reports/screenshot-{timestamp}.png")
        extras.append(pytest_html.extras.image(f"screenshot-{timestamp}.png"))
        extras.append(pytest_html.extras.text(f"Usage: {al.stats}"))
        extras.append(pytest_html.extras.url(al.driver.url))

        report.extras = extras

        # Process Alumnium cache
        if report.passed:
            al.cache.save()
        else:
            al.cache.discard()
