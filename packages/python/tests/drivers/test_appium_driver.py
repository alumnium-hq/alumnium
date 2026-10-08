from unittest.mock import MagicMock

from appium.webdriver.common.appiumby import AppiumBy as By
from pytest import raises
from selenium.common.exceptions import NoSuchElementException

from alumnium.accessibility import AccessibilityElement
from alumnium.drivers.appium_driver import AppiumDriver


def test_find_element_ios_finds_single_element_when_index_is_zero():
    remote = ios_remote()
    native_element = MagicMock()
    remote.find_element.return_value = native_element
    driver = AppiumDriver(remote)
    element = AccessibilityElement(
        id=2,
        type="XCUIElementTypeButton",
        name="Continue",
        index=0,
    )

    assert driver._find_element_ios(element) is native_element
    remote.find_element.assert_called_once_with(
        By.IOS_PREDICATE,
        'type == "XCUIElementTypeButton" AND name == "Continue"',
    )
    remote.find_elements.assert_not_called()


def test_find_element_ios_picks_element_at_index_among_predicate_matches():
    remote = ios_remote()
    native_elements = [MagicMock(), MagicMock()]
    remote.find_elements.return_value = native_elements
    driver = AppiumDriver(remote)
    element = AccessibilityElement(
        id=3,
        type="XCUIElementTypeButton",
        name="Action",
        index=1,
    )

    assert driver._find_element_ios(element) is native_elements[1]
    remote.find_elements.assert_called_once_with(
        By.IOS_PREDICATE,
        'type == "XCUIElementTypeButton" AND name == "Action"',
    )
    remote.find_element.assert_not_called()


def test_find_element_ios_fails_when_index_is_out_of_predicate_matches():
    remote = ios_remote()
    remote.find_elements.return_value = [MagicMock(), MagicMock()]
    driver = AppiumDriver(remote)
    element = AccessibilityElement(
        id=4,
        type="XCUIElementTypeButton",
        name="Action",
        index=2,
    )

    with raises(NoSuchElementException, match="at index 2, found 2 elements"):
        driver._find_element_ios(element)


def ios_remote() -> MagicMock:
    remote = MagicMock()
    remote.capabilities = {"automationName": "XCUITest"}
    return remote
