from os import getenv

from pytest import fixture, mark
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.support.expected_conditions import presence_of_element_located
from selenium.webdriver.support.wait import WebDriverWait

from alumnium import Model, Provider


driver_type = getenv("ALUMNIUM_DRIVER", "selenium")


@fixture(autouse=True)
def login(al, driver, execute_script, navigate):
    al.learn("add laptop to cart", ["click button 'Add to cart' next to 'laptop' product"])
    al.learn(
        "go to shopping cart",
        ["click link after 'Swag Labs'"],
        """
<generic id="14">
  <generic id="32">Swag Labs</generic>
</generic>
<generic id="15">
  <link id="33">2</link>
</generic>
    """.strip(),
    )

    if driver_type == "appium":
        al.learn(
            "sort products by lowest shipping cost",
            [
                "click sorting dropdown",
                'click "Shipping (low to high)"',
            ],
        )
    else:
        al.learn(
            "sort products by lowest shipping cost",
            ["select 'Shipping (low to high)' in sorting dropdown"],
        )
        al.learn(
            "sort products by highest shipping cost",
            ["select 'Shipping (high to low)' in sorting dropdown"],
        )

    navigate("https://www.saucedemo.com/")
    al.do("type 'standard_user' into username field")
    al.do("type 'secret_sauce' into password field")
    al.do("click login button")
    if driver_type == "appium":
        wait = WebDriverWait(driver, 2)
        try:
            button = wait.until(
                presence_of_element_located(
                    (
                        "xpath",
                        "//XCUIElementTypeButton[@name='Not Now']",
                    )
                )
            )
            button.click()
        except TimeoutException:
            pass

    yield
    execute_script("window.localStorage.clear()")

    al.planner_agent.prompt_with_examples.examples.clear()


@mark.xfail(
    Model.current.provider in [Provider.ANTHROPIC, Provider.AWS_ANTHROPIC],
    reason="Need to add proper types in `RetrievedInformation.value`.",
)
@mark.xfail(Model.current.provider == Provider.OLLAMA, reason="Too hard for Mistral")
@mark.xfail(
    Model.current.provider == Provider.GOOGLE,
    reason="https://github.com/langchain-ai/langchain-google/issues/734",
)
def test_sorting(al):
    products = {
        "Sauce Labs Backpack": 29.99,
        "Sauce Labs Bike Light": 9.99,
        "Sauce Labs Bolt T-Shirt": 15.99,
        "Sauce Labs Fleece Jacket": 49.99,
        "Sauce Labs Onesie": 7.99,
        "Test.allTheThings() T-Shirt (Red)": 15.99,
    }
    titles = list(products.keys())
    prices = list(products.values())

    # Default order is A-Z
    assert al.get("titles of products") == sorted(titles)

    al.do("sort products in descending alphabetical order")
    assert al.get("titles of products") == sorted(titles, reverse=True)

    al.do("sort products in ascending alphabetical order")
    assert al.get("titles of products") == sorted(titles)

    al.do("sort products by lowest price")
    assert al.get("prices of products") == sorted(prices)

    al.do("sort products by highest price")
    assert al.get("prices of products") == sorted(prices, reverse=True)


@mark.xfail(
    Model.current.provider == Provider.GOOGLE,
    reason="https://github.com/langchain-ai/langchain-google/issues/734",
)
@mark.xfail(Model.current.provider == Provider.OLLAMA, reason="Too hard for Mistral")
@mark.xfail(
    driver_type == "appium",
    reason="https://github.com/alumnium-hq/alumnium/issues/132",
)
def test_checkout(al):
    al.do("add onesie to cart")
    al.do("add backpack to cart")
    al.do("go to shopping cart")
    assert al.get("titles of products in cart") == ["Sauce Labs Onesie", "Sauce Labs Backpack"]

    al.do("go to checkout")
    al.do("continue with first name - Al, last name - Um, ZIP - 95122")

    assert al.get("item total without tax") == 37.98
    assert al.get("tax amount") == 3.04
    assert al.get("total amount with tax") == round(37.98 + 3.04, 2)
    assert al.get("shipping information value") == "Free Pony Express Delivery!"

    al.do("finish checkout")

    al.check("thank you for the order message is shown")
    if Model.current.provider != Provider.DEEPSEEK:
        al.check("big green checkmark is shown", vision=True)
