import langchain
import nerodia

from alumni import Alumni
from behave import fixture, use_fixture
from selenium.webdriver import Chrome, ChromeOptions


langchain.debug = True
nerodia.default_timeout = 5


@fixture
def chrome_driver(context):
    options = ChromeOptions()
    options.web_socket_url = True
    context.driver = Chrome(options=options)
    context.driver._start_bidi()
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
