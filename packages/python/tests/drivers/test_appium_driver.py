from unittest.mock import MagicMock

from appium.webdriver.common.appiumby import AppiumBy as By
from selenium.common.exceptions import NoSuchElementException

from alumnium.accessibility import AccessibilityElement
from alumnium.drivers.appium_driver import AppiumDriver


def test_find_element_ios_keeps_single_element_query_for_unique_predicate():
    remote = ios_remote()
    native_element = MagicMock()
    remote.find_element.return_value = native_element
    driver = AppiumDriver(remote)
    element = AccessibilityElement(
        id=2,
        type="XCUIElementTypeButton",
        name="Continue",
        index=0,
        match_count=1,
    )

    assert driver._find_element_ios(element) is native_element
    remote.find_element.assert_called_once_with(
        By.IOS_PREDICATE,
        'type == "XCUIElementTypeButton" AND name == "Continue"',
    )
    remote.find_elements.assert_not_called()


def test_find_element_ios_selects_recorded_duplicate_occurrence():
    remote = ios_remote()
    native_elements = [MagicMock(), MagicMock()]
    remote.find_elements.return_value = native_elements
    driver = AppiumDriver(remote)
    element = AccessibilityElement(
        id=3,
        type="XCUIElementTypeButton",
        name="Action",
        index=1,
        match_count=2,
    )

    assert driver._find_element_ios(element) is native_elements[1]
    remote.find_elements.assert_called_once_with(
        By.IOS_PREDICATE,
        'type == "XCUIElementTypeButton" AND name == "Action"',
    )
    remote.find_element.assert_not_called()


def test_find_element_ios_fails_when_appium_returns_fewer_duplicates():
    remote = ios_remote()
    remote.find_elements.return_value = [MagicMock(), MagicMock()]
    driver = AppiumDriver(remote)
    element = AccessibilityElement(
        id=4,
        type="XCUIElementTypeButton",
        name="Action",
        index=2,
        match_count=3,
    )

    try:
        driver._find_element_ios(element)
    except NoSuchElementException as error:
        assert (
            'occurrence 2 for type == "XCUIElementTypeButton" AND name == "Action"; Appium returned 2 matches'
            in str(error)
        )
    else:
        raise AssertionError("Expected duplicate lookup to fail")


def ios_remote() -> MagicMock:
    remote = MagicMock()
    remote.capabilities = {"automationName": "XCUITest"}
    return remote
