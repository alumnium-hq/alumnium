def test_checkout(al, driver):
    driver.get("https://bstackdemo.com")

    # Add products to the cart
    al.do("add to cart product 'iPhone 12 Pro Max'")
    al.do("add to cart product 'iPhone 12 Mini'")
    assert al.get("titles of products in cart") == ["iPhone 12 Pro Max", "iPhone 12 Mini"]

    # Start checkout and login
    al.do("go to checkout")
    al.do("type 'demouser' into username field and press tab")
    al.do("type 'testingisfun99' into password field and press tab")
    al.do("click log in button")

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
