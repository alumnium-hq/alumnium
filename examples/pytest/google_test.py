from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait


# def test_google_search(driver):
#     driver.get("https://www.google.com")
#     driver.find_element(By.NAME, "q").send_keys("selenium", Keys.RETURN)
#     wait = WebDriverWait(driver, timeout=2)
#     wait.until(lambda _: driver.find_elements(By.CSS_SELECTOR, "h3"))
#     assert "selenium" in driver.title


def test_google_search(al):
    al.act("open URL https://www.google.com")
    al.act("search for selenium")
    al.assess("selenium in page title")
