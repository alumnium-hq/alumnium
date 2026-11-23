from unittest.mock import MagicMock

from alumnium.area import Area


def test_check_with_vision_sends_area_screenshot():
    area, driver, client, tree = make_area()

    area.check("has a logo", vision=True)

    driver.set_accessibility_tree.assert_called_once_with(tree)
    driver.element_screenshot.assert_called_once_with(42)
    assert client.retrieve.call_args.kwargs["screenshot"] == "area-screenshot"


def test_check_with_vision_falls_back_to_full_screenshot():
    area, driver, client, _ = make_area()
    driver.element_screenshot.side_effect = Exception("Cannot take screenshot with 0 width.")

    area.check("has a logo", vision=True)

    assert client.retrieve.call_args.kwargs["screenshot"] == "full-screenshot"


def test_check_without_vision_sends_no_screenshot():
    area, driver, client, _ = make_area()

    area.check("has a logo")

    driver.element_screenshot.assert_not_called()
    assert client.retrieve.call_args.kwargs["screenshot"] is None


def test_get_with_vision_sends_area_screenshot():
    area, driver, client, _ = make_area()

    area.get("logo text", vision=True)

    driver.element_screenshot.assert_called_once_with(42)
    assert client.retrieve.call_args.kwargs["screenshot"] == "area-screenshot"


def make_area():
    tree = MagicMock()
    tree.to_str.return_value = "<area />"
    driver = MagicMock()
    driver.element_screenshot.return_value = "area-screenshot"
    driver.screenshot = "full-screenshot"
    client = MagicMock()
    client.retrieve.return_value = ("explanation", True)
    area = Area(42, "header", driver, tree, {}, client)
    return area, driver, client, tree
