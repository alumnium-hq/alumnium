from datetime import datetime

from alumnium import Alumni
from selenium.webdriver import Chrome
from pytest import fixture, hookimpl


@fixture(scope="session", autouse=True)
def driver():
    driver = Chrome()
    yield driver
    driver.quit()


@fixture(scope="session", autouse=True)
def al(driver):
    al = Alumni(driver)
    yield al
    al.quit()


@hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item):
    timestamp = datetime.now().strftime("%H-%M-%S")
    pytest_html = item.config.pluginmanager.getplugin("html")
    outcome = yield
    report = outcome.get_result()
    extras = getattr(report, "extras", [])
    if report.when == "call":
        driver = item.funcargs["driver"]
        driver.save_screenshot(f"reports/screenshot-{timestamp}.png")
        extras.append(pytest_html.extras.image(f"screenshot-{timestamp}.png"))
        extras.append(pytest_html.extras.url(driver.current_url))
        report.extras = extras
