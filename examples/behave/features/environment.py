from alumnium import Alumni
from alumnium.models import Model
from behave import fixture, use_fixture
from selenium.webdriver import Chrome

# from langchain.globals import set_debug

# set_debug(True)


@fixture
def chrome_driver(context):
    context.driver = Chrome()
    yield context.driver
    context.driver.quit()


@fixture
def alumnium(context):
    context.al = Alumni(context.driver, model=Model.OPEN_AI)
    yield context.al
    context.al.quit()


def before_all(context):
    use_fixture(chrome_driver, context)
    use_fixture(alumnium, context)
