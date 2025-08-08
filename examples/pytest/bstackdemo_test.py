from os import getenv

from pytest import fixture, mark

from alumnium import Model, Provider

driver_type = getenv("ALUMNIUM_DRIVER", "selenium")


@fixture(autouse=True)
def learn(al, execute_script, navigate):
    al.learn("add 'Laptop' to cart", ["click button 'Add to cart' next to 'Laptop' product"])
    navigate("https://bstackdemo.com")
    yield
    execute_script("window.localStorage.clear()")
    al.clear_learn_examples()


@mark.xfail(
    Model.current.provider in [Provider.ANTHROPIC, Provider.AWS_ANTHROPIC],
    reason="Actor agent hallucinates element IDs.",
)
@mark.xfail(Model.current.provider == Provider.MISTRALAI, reason="Needs more tuning.")
@mark.xfail(driver_type == "appium", reason="https://github.com/alumnium-hq/alumnium/issues/132")
def test_checkout(al):
    # Add products to the cart
    al.do("add 'iPhone 12 Pro Max' to cart")
    al.do("add 'iPhone 12 Mini' to cart")
    cart = al.area("shopping bag")
    assert cart.get("titles of products") == ["iPhone 12 Pro Max", "iPhone 12 Mini"]

    # Start checkout and login
    al.do("go to checkout")
    al.do("type 'demouser' into username field and press tab")
    al.do("type 'testingisfun99' into password field and press enter")
    al.do("click login button")  # Could be NOOP

    # Proceed through checkout
    assert al.get("iPhone 12 Pro Max price") == 1099
    assert al.get("iPhone 12 Mini price") == 699
    assert al.get("total amount") == 1798

    fields = {
        "first name": "Al",
        "last name": "Um",
        "address": "1st Market Street",
        "state": "CA",
        "postal code": 95122,
    }
    al.do(f"submit with {fields}")
    al.check("order is placed message is shown")
