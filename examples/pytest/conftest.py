from pytest import fixture
from alumnium import Alumni
from alumnium.models import Model
from selenium.webdriver import Chrome

# from langchain.globals import set_debug

# set_debug(True)


@fixture(scope="session", autouse=True)
def driver():
    driver = Chrome()
    yield driver
    driver.quit()


@fixture(scope="session", autouse=True)
def al(driver):
    al = Alumni(driver, model=Model.OPENAI)
    yield al
    al.quit()
