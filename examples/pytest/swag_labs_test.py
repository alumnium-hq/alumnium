from pytest import fixture, mark

from alumnium import Model


@fixture(autouse=True)
def login(al, execute_script, navigate):
    al.learn("add laptop to cart", ["click button 'Add to cart' next to 'laptop' product"])
    al.learn("go to shopping cart", ["click link to the right of 'Swag Labs' header"])
    al.learn("sort products by lowest shipping cost", ["select 'Shipping (low to high)' in sorting dropdown"])

    navigate("https://www.saucedemo.com/")
    al.do("type 'standard_user' into username field")
    al.do("type 'secret_sauce' into password field")
    al.do("click login button")
    yield
    execute_script("window.localStorage.clear()")

    al.planner_agent.prompt_with_examples.examples.clear()


@mark.xfail(
    Model.load() in [Model.ANTHROPIC, Model.AWS_ANTHROPIC],
    reason="Need to add proper types in `RetrievedInformation.value`.",
)
@mark.xfail(Model.load() == Model.AWS_META, reason="Too hard for Llama")
@mark.xfail(Model.load() == Model.GOOGLE, reason="https://github.com/langchain-ai/langchain-google/issues/734")
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


@mark.xfail(Model.load() == Model.GOOGLE, reason="https://github.com/langchain-ai/langchain-google/issues/734")
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
    assert al.get("shipping details") == "Free Pony Express Delivery!"

    al.do("finish checkout")

    al.check("thank you for the order message is shown")
    if Model.load() != Model.AWS_META:
        al.check("big green checkmark is shown", vision=True)
