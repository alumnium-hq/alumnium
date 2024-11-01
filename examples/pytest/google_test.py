from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait


# def test_google_search_sw(driver):
#     driver.get("https://www.google.com")
#     driver.find_element(By.TAG_NAME, "textarea").send_keys("selenium", Keys.RETURN)
#     wait = WebDriverWait(driver, timeout=2)
#     wait.until(lambda _: driver.find_elements(By.CSS_SELECTOR, "h3"))
#     assert "selenium" in driver.title


def test_google_search(al, driver):
    driver.get("https://www.google.com")
    al.do("search for selenium")
    al.check("selenium in page title")
    al.check("selenium.dev is present in the search results")
