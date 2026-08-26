from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from os import getenv
from pathlib import Path
from threading import Thread
from time import monotonic, sleep
from typing import NamedTuple

from appium.options.android import UiAutomator2Options
from appium.options.ios import XCUITestOptions
from appium.webdriver.client_config import AppiumClientConfig
from appium.webdriver.webdriver import WebDriver as Appium
from dotenv import load_dotenv
from playwright.sync_api import Page, sync_playwright
from pytest import fixture, hookimpl
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.webdriver import WebDriver as ChromeDriver
from selenium.webdriver.remote.webdriver import WebDriver as SeleniumWebDriver

from alumnium import Alumni
from alumnium.drivers.appium_driver import AppiumDriver
from examples.test_threshold import get_pass_threshold, process_pass_threshold

load_dotenv()

driver_type = getenv("ALUMNIUM_DRIVER", "selenium")
headless = getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true")
model_label = getenv("ALUMNIUM_MODEL")
run_model_name = f"ALUMNIUM_MODEL={model_label}" if model_label else "server-set model"
test_results = {"passed": 0, "failed": 0, "errors": 0}
get_pass_threshold()


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
        driver = ChromeDriver(options=options)
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
                    "name": f"Pytest ({run_model_name})",
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
                    "name": f"Pytest ({run_model_name})",
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

        if driver_type == "appium-android":
            driver.update_settings(
                {
                    "allowInvisibleElements": True,
                    "ignoreUnimportantViews": True,
                }
            )

        yield driver
    else:
        raise NotImplementedError(f"Driver {driver_type} not implemented")


@fixture(scope="session")
def al(driver):
    al = _create_al(driver)
    yield al
    al.quit()


@fixture
def al_factory(driver):
    al_list: list[Alumni] = []

    def _create(*, extra_tools=None):
        al = _create_al(driver, extra_tools=extra_tools)
        al_list.append(al)
        return al

    yield _create

    for al in reversed(al_list):
        # NOTE: We don't call al.quit() here as we have single a single driver
        # instance and quitting it would break all the tests.
        al.client.quit()


def _create_al(driver, extra_tools=None):
    al = Alumni(driver, extra_tools=extra_tools or [])
    if isinstance(al.driver, AppiumDriver):
        al.driver.delay = 0.1
    return al


@fixture
def navigate(al):
    def __navigate(url: str):
        if not url.startswith("http"):
            url = f"file://{Path(__file__).parent.parent}/support/pages/{url}"

        al.driver.visit(url)

    return __navigate


class SlowTabPage(NamedTuple):
    url: str
    slow_tab_url: str


@fixture
def slow_tab_page():
    """Serves a page whose button opens a tab that only navigates after a delay."""
    opener = (
        b"<title>Opener</title><h1>Opener</h1>"
        b"<button onclick=\"window.open('/slow-tab', '_blank')\">Open Slow Tab</button>"
    )
    slow_tab = b"<title>Slow Tab</title><h1>Slow Tab</h1>"

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            is_slow_tab = self.path == "/slow-tab"
            if is_slow_tab:
                sleep(2)

            body = slow_tab if is_slow_tab else opener
            self.send_response(200)
            self.send_header("content-type", "text/html")
            self.send_header("cache-control", "no-store")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):
            pass

    # The slow tab blocks its own request, so it must not block the opener
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()

    port = server.server_port
    yield SlowTabPage(f"http://127.0.0.1:{port}/", f"http://127.0.0.1:{port}/slow-tab")

    server.shutdown()
    server.server_close()


@fixture
def wait_for_tab_count(driver):
    def __wait_for_tab_count(count: int):
        deadline = monotonic() + 10
        while _tab_count(driver) < count:
            if monotonic() > deadline:
                raise AssertionError(f"Timed out waiting for {count} tabs to open")
            _pause(driver)

    return __wait_for_tab_count


@fixture(autouse=True)
def close_extra_tabs(al, driver):
    yield
    if isinstance(driver, Page):
        al.driver.autoswitch_to_new_tab = True
        for page in driver.context.pages:
            if page is not driver:
                page.close()
    elif isinstance(driver, SeleniumWebDriver):
        al.driver.autoswitch_to_new_tab = True
        original, *extra = driver.window_handles
        for handle in extra:
            driver.switch_to.window(handle)
            driver.close()
        driver.switch_to.window(original)


@fixture
def execute_script(al):
    return lambda script: al.driver.execute_script(script)


@fixture
def type(driver):
    def __type(element, text):
        if isinstance(driver, (Appium, SeleniumWebDriver)):
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

        if isinstance(driver, (Appium, SeleniumWebDriver)):
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

        if report.passed:
            test_results["passed"] += 1
        elif report.failed:
            test_results["failed"] += 1
    elif report.failed:
        test_results["errors"] += 1


def pytest_sessionfinish(session, exitstatus):
    if exitstatus != 1 or test_results["errors"]:
        return
    session.exitstatus = process_pass_threshold(test_results["passed"], test_results["failed"])


def _tab_count(driver) -> int:
    if isinstance(driver, Page):
        return len(driver.context.pages)
    elif isinstance(driver, SeleniumWebDriver):
        return len(driver.window_handles)
    else:
        raise NotImplementedError("Tabs are not implemented in Appium yet")


def _pause(driver):
    if isinstance(driver, Page):
        driver.wait_for_timeout(50)
    else:
        sleep(0.05)
