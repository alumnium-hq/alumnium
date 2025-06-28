from datetime import datetime
from os import getenv

from appium.options.ios import XCUITestOptions
from appium.webdriver.webdriver import WebDriver as Appium
from playwright.sync_api import Page, sync_playwright
from pytest import fixture, hookimpl
from selenium.webdriver import Chrome

from alumnium import Alumni


@fixture(scope="session", autouse=True)
def driver():
    driver = getenv("ALUMNIUM_DRIVER", "selenium")
    if driver == "playwright":
        with sync_playwright() as playwright:
            headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true") == "true"
            yield playwright.chromium.launch(headless=headless).new_page()
    elif driver == "selenium":
        driver = Chrome()
        yield driver
    elif driver == "appium":
        options = XCUITestOptions()
        # https://github.com/ayodejiayankola/To-Do-App-SwiftUI
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
        if isinstance(driver, (Appium, Chrome)):
            driver.execute_script(script)
        elif isinstance(driver, Page):
            driver.evaluate(script)

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
            url = driver.current_url
        elif isinstance(driver, Page):
            driver.screenshot(path=f"reports/screenshot-{timestamp}.png")
            url = driver.url
        extras.append(pytest_html.extras.image(f"screenshot-{timestamp}.png"))
        extras.append(pytest_html.extras.json(al.stats()))
        extras.append(pytest_html.extras.url(url))
        report.extras = extras

        # Process Alumnium cache
        if report.passed:
            al.cache.save()
        else:
            al.cache.discard()
