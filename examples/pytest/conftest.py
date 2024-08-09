import pytest
import nerodia
from alumni import Alumni
from selenium.webdriver import Chrome, ChromeOptions

nerodia.default_timeout = 5


@pytest.fixture(scope="session", autouse=True)
def driver():
    options = ChromeOptions()
    options.web_socket_url = True
    driver = Chrome(options=options)
    driver._start_bidi()
    yield driver
    driver.quit()


@pytest.fixture(scope="session", autouse=True)
def al(driver):
    al = Alumni(driver)
    yield al
    al.quit()
