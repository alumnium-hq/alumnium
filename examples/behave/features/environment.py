from alumni import Alumni
from behave import fixture, use_fixture
from selenium.webdriver import Chrome


@fixture
def chrome_driver(context):
    context.driver = Chrome()
    yield context.driver
    context.driver.quit()


@fixture
def alumnium(context):
    context.al = Alumni(context.driver)
    yield context.al
    context.al.quit()


def before_all(context):
    use_fixture(chrome_driver, context)
    use_fixture(alumnium, context)
