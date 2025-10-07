from datetime import datetime
from os import getenv
from pathlib import Path

from appium.options.ios import XCUITestOptions
from appium.webdriver.client_config import AppiumClientConfig
from appium.webdriver.webdriver import WebDriver as Appium
from behave import fixture, use_fixture
from behave.contrib.scenario_autoretry import patch_scenario_with_autoretry
from playwright.sync_api import Page, sync_playwright
from selenium.webdriver import Chrome

from alumnium import Alumni, Model


@fixture
def driver(context):
    driver = getenv("ALUMNIUM_DRIVER", "selenium")
    if driver == "playwright":
        with sync_playwright() as playwright:
            context.driver = playwright.chromium.launch().new_page()
            yield context.driver
    elif driver == "selenium":
        context.driver = Chrome()
        yield context.driver
        context.driver.quit()
    elif driver == "appium":
        options = XCUITestOptions()
        options.automation_name = "XCUITest"
        options.device_name = "iPhone 16"
        options.platform_name = "iOS"

        lt_username = getenv("LT_USERNAME", None)
        lt_access_key = getenv("LT_ACCESS_KEY", None)

        if lt_username and lt_access_key:
            options.platform_version = "18"
            # curl -u "USERNAME:PASSWORD" -XPOST \
            #   "https://manual-api.lambdatest.com/app/upload/realDevice" \
            #   -F "appFile=@"/Users/p0deje/Downloads/TodoList/TodoList.ipa"" \
            #   -F "name="TodoList""
            options.app = "lt://APP10160301591759783837362495"
            options.set_capability(
                "lt:options",
                {
                    "build": "Python - iOS",
                    "name": f"Behave ({Model.current.provider.value}/{Model.current.name}) ",
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
            options.platform_version = "18.4"
            # https://github.com/ayodejiayankola/To-Do-App-SwiftUI
            options.app = f"{Path(__file__).parent}/support/ToDoList.app"
            options.new_command_timeout = 300
            options.wda_launch_timeout = 90_000  # ms

            client_config = AppiumClientConfig(
                remote_server_addr="http://localhost:4723/wd/hub",
                direct_connection=True,
            )

        context.app = options.app
        context.driver = Appium(
            options=options,
            client_config=client_config,
        )

        yield context.driver
    else:
        raise NotImplementedError(f"Driver {driver} not implemented")


@fixture
def alumnium(context):
    context.al = Alumni(context.driver, url=getenv("ALUMNIUM_SERVER_URL", None))
    if isinstance(context.driver, Appium):
        context.al.driver.autoswitch_to_webview = False  # Slow!
        context.al.driver.delay = 0.1

        context.al.learn(
            goal='create a new task "this is Al"',
            actions=[
                'type "this is Al" to a text field',
                "click save button",
            ],
        )
        context.al.learn(
            goal='mark the "this is Al" task as completed',
            actions=['click checkbox near the "this is Al" task'],
        )
        context.al.learn(
            goal='delete the "this is Al" task',
            actions=[
                "click edit button",
                'click button "-" near the "this is Al" task',
                'click button "Delete" near the "this is Al" task',
                "click done button",
            ],
        )
    else:
        context.al.learn(
            goal='create a new task "this is Al"',
            actions=[
                'type "this is Al" in textbox "what needs to be done"',
                'press key "Enter"',
            ],
        )
        context.al.learn(
            goal='mark the "this is Al" task as completed',
            actions=['click checkbox near the "this is Al" task'],
        )
        context.al.learn(
            goal='delete the "this is Al" task',
            actions=[
                'hover the "this is Al" task',
                'click button "x" near the "this is Al" task',
            ],
        )

    yield context.al
    context.al.quit()


def before_all(context):
    use_fixture(driver, context)
    use_fixture(alumnium, context)
    for formatter in context._runner.formatters:
        if formatter.name == "html-pretty":
            context.embed = formatter.embed


def before_feature(_, feature):
    if getenv("CI", "false").lower() == "true":
        for scenario in feature.walk_scenarios():
            patch_scenario_with_autoretry(scenario, max_attempts=2)


def after_scenario(context, scenario):
    if scenario.status == "passed":
        context.al.cache.save()
    else:
        context.al.cache.discard()

    for formatter in context._runner.formatters:
        if formatter.name == "html-pretty":
            timestamp = datetime.now().strftime("%H-%M-%S")
            if isinstance(context.driver, Chrome) or isinstance(context.driver, Appium):
                context.driver.save_screenshot(f"reports/screenshot-{timestamp}.png")
            elif isinstance(context.driver, Page):
                context.driver.screenshot(path=f"reports/screenshot-{timestamp}.png")
            formatter.embed(
                mime_type="image/png",
                data=f"reports/screenshot-{timestamp}.png",
                caption="Screenshot",
            )
            formatter.embed(
                mime_type="text/plain",
                data=f"Usage: {context.al.stats}",
                caption="Tokens used",
            )

    if isinstance(context.driver, Appium):
        context.driver.terminate_app("com.ayodeji.TodoList")
        context.driver.remove_app("com.ayodeji.TodoList")
        context.driver.install_app(context.app)
