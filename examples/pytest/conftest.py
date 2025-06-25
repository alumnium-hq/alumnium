import pytest
import time

from datetime import datetime
from os import getenv

from appium import webdriver as AppiumWebdriver
from appium.options.ios import XCUITestOptions
from appium.webdriver.appium_service import AppiumService
from playwright.sync_api import Page, sync_playwright
from pytest import fixture, hookimpl
from selenium.webdriver import Chrome

from alumnium import Alumni

# --- Configuration for your Appium Server ---
APPIUM_HOST = '127.0.0.1' # Or your desired IP
APPIUM_PORT = 4724        # Or your desired port

@fixture(scope="session", autouse=True)
def driver():
    driver = getenv("ALUMNIUM_DRIVER", "appium")
    if driver == "playwright":
        with sync_playwright() as playwright:
            headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true") == "true"
            yield playwright.chromium.launch(headless=headless).new_page()
    elif driver == "selenium":
        driver = Chrome()
        yield driver
    elif driver == "appium":
        options = XCUITestOptions().load_capabilities({
            'platformName': 'iOS',
            'platformVersion': '18.3',
            'deviceName': 'iPhone 14 Pro',
            'automationName': 'XCUITest',
            'bundleId': 'com.apple.mobilesafari',
            'noReset': True, 
            'newCommandTimeout': 60000,
            'showXcodeLog': True
        })
        driver = AppiumWebdriver.Remote(
            command_executor=f'http://{APPIUM_HOST}:{APPIUM_PORT}/wd/hub',
            options=options
        )
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
        if isinstance(driver, Chrome):
            driver.get(url)
        elif isinstance(driver, Page):
            driver.goto(url)
        elif isinstance(driver, AppiumWebdriver.Remote):
            driver.get(url)

    return __navigate


@fixture
def execute_script(driver):
    def __execute_script(script):
        if isinstance(driver, Chrome):
            driver.execute_script(script)
        elif isinstance(driver, Page):
            driver.evaluate(script)
        elif isinstance(driver, AppiumWebdriver.Remote):
            driver.execute_script(script)

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

        if isinstance(driver, Chrome):
            driver.save_screenshot(f"reports/screenshot-{timestamp}.png")
            url = driver.current_url
        elif isinstance(driver, Page):
            driver.screenshot(path=f"reports/screenshot-{timestamp}.png")
            url = driver.url
        elif isinstance(driver, AppiumWebdriver.Remote):
            driver.get_screenshot_as_file(f"reports/screenshot-{timestamp}.png")
            url = al.driver.url
        extras.append(pytest_html.extras.image(f"screenshot-{timestamp}.png"))
        extras.append(pytest_html.extras.json(al.stats()))
        extras.append(pytest_html.extras.url(url))
        report.extras = extras

        # Process Alumnium cache
        if report.passed:
            al.cache.save()
        else:
            al.cache.discard()
