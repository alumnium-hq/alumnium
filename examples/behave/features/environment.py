from datetime import datetime

from alumnium import Alumni
from behave import fixture, use_fixture
from selenium.webdriver import Chrome

# from langchain.globals import set_debug

# set_debug(True)


@fixture
def driver(context):
    context.driver = Chrome()
    yield context.driver
    context.driver.quit()


@fixture
def alumnium(context):
    context.al = Alumni(context.driver)
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
            context.driver.save_screenshot(f"reports/screenshot-{timestamp}.png")
            formatter.embed(
                mime_type="image/png",
                data=f"reports/screenshot-{timestamp}.png",
                caption="Screenshot",
            )
