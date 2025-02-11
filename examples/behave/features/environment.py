from datetime import datetime
from os import getenv

from behave import fixture, use_fixture
from playwright.sync_api import Page, sync_playwright
from selenium.webdriver import Chrome

from alumnium import Alumni


@fixture
def driver(context):
    driver = getenv("ALUMNIUM_DRIVER", "selenium")
    if driver == "playwright":
        with sync_playwright() as playwright:
            context.driver = playwright.chromium.launch().new_page()
            yield context.driver
    elif driver == "selenium":
        context.driver = Chrome()
        yield driver
        context.driver.quit()
    else:
        raise NotImplementedError(f"Driver {driver} not implemented")


@fixture
def alumnium(context):
    context.al = Alumni(context.driver)
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


def after_scenario(context, scenario):
    for formatter in context._runner.formatters:
        if formatter.name == "html-pretty":
            timestamp = datetime.now().strftime("%H-%M-%S")
            if isinstance(context.driver, Chrome):
                context.driver.save_screenshot(f"reports/screenshot-{timestamp}.png")
            elif isinstance(context.driver, Page):
                context.driver.screenshot(path=f"reports/screenshot-{timestamp}.png")
            formatter.embed(
                mime_type="image/png",
                data=f"reports/screenshot-{timestamp}.png",
                caption="Screenshot",
            )
