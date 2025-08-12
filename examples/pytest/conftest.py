from datetime import datetime
from os import getenv

from appium.options.ios import XCUITestOptions
from appium.webdriver.webdriver import WebDriver as Appium
from dotenv import load_dotenv
from playwright.sync_api import Page, sync_playwright
from pytest import fixture, hookimpl
from selenium.webdriver import Chrome
from selenium.webdriver.chrome.options import Options as ChromeOptions

from alumnium import Alumni

load_dotenv(override=True)

driver_type = getenv("ALUMNIUM_DRIVER", "selenium")
headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true")


@fixture(scope="session", autouse=True)
def driver():
    if driver_type == "playwright":
        with sync_playwright() as playwright:
            is_headless = headless.lower() == "true"
            yield playwright.chromium.launch(headless=is_headless).new_page()
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
    elif driver_type == "appium":
        options = XCUITestOptions()
        options.automation_name = "XCUITest"
        options.bundle_id = "com.apple.mobilesafari"
        options.device_name = "iPhone 15"
        options.new_command_timeout = 300
        options.no_reset = True
        options.platform_name = "iOS"
        options.platform_version = "17.4"
        driver = Appium(command_executor="http://localhost:4723", options=options)
        yield driver
    else:
        raise NotImplementedError(f"Driver {driver} not implemented")


@fixture(scope="session", autouse=True)
def al(driver):
    al = Alumni(driver)
    if driver_type == "appium":
        al.driver.delay = 0.1

    yield al
    al.quit()


@fixture
def navigate(driver):
    def __navigate(url):
        if isinstance(driver, (Appium, Chrome)):
            driver.get(url)
        elif isinstance(driver, Page):
            driver.goto(url)

    return __navigate


@fixture
def execute_script(driver):
    def __execute_script(script):
        if isinstance(driver, Chrome):
            driver.execute_script(script)
        elif isinstance(driver, Page):
            driver.evaluate(script)
        elif isinstance(driver, Appium):
            current_context = driver.current_context
            for context in driver.contexts:
                if "WEBVIEW" in context:
                    driver.switch_to.context(context)
                    driver.execute_script(script)
                    driver.switch_to.context(current_context)

    return __execute_script


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
        extras.append(pytest_html.extras.json(al.stats()))
        extras.append(pytest_html.extras.url(al.driver.url))
        report.extras = extras

        # Process Alumnium cache
        if report.passed:
            al.cache.save()
        else:
            al.cache.discard()
