from datetime import datetime
from os import getenv

from alumnium import Alumni
from selenium.webdriver import Chrome
from playwright.sync_api import sync_playwright, Page
from pytest import fixture, hookimpl


@fixture(scope="session", autouse=True)
def driver():
    driver = getenv("ALUMNIUM_DRIVER", "selenium")
    if driver == "playwright":
        with sync_playwright() as playwright:
            yield playwright.chromium.launch(headless=False).new_page()
    elif driver == "selenium":
        driver = Chrome()
        yield driver
        driver.quit()
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

    return __navigate


@hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item):
    timestamp = datetime.now().strftime("%H-%M-%S")
    pytest_html = item.config.pluginmanager.getplugin("html")
    outcome = yield
    report = outcome.get_result()
    extras = getattr(report, "extras", [])
    if report.when == "call":
        driver = item.funcargs["driver"]
        if isinstance(driver, Chrome):
            driver.save_screenshot(f"reports/screenshot-{timestamp}.png")
            url = driver.current_url
        elif isinstance(driver, Page):
            driver.screenshot(path=f"reports/screenshot-{timestamp}.png")
            url = driver.url
        extras.append(pytest_html.extras.image(f"screenshot-{timestamp}.png"))
        extras.append(pytest_html.extras.url(url))
        report.extras = extras
