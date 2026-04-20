# ruff: noqa: E501

from unittest.mock import MagicMock

from pytest import fixture

from alumnium import Area


@fixture
def mock_area():
    """Create an Area instance with mocked dependencies."""
    mock_driver = MagicMock()
    mock_driver.title = "Test Page"
    mock_driver.url = "https://example.com"
    mock_driver.app = "web"
    mock_driver.screenshot = "base64_screenshot"

    mock_tree = MagicMock()
    mock_tree.to_str.return_value = "<root><button raw_id='1'>Click me</button></root>"

    mock_client = MagicMock()
    mock_tools = {}

    return Area(
        id=1,
        description="Test area",
        driver=mock_driver,
        accessibility_tree=mock_tree,
        tools=mock_tools,
        client=mock_client,
    )


def test_area_get_returns_value_when_not_none(mock_area: Area):
    """Test that Area.get() returns the value when value is not None."""
    mock_area.client.retrieve.return_value = ("explanation", "extracted data")  # type: ignore[method-assign]

    result = mock_area.get("heading text")

    assert result == "extracted data"
    mock_area.client.retrieve.assert_called_once_with(  # type: ignore[attr-defined]
        "heading text",
        "<root><button raw_id='1'>Click me</button></root>",
        title="Test Page",
        url="https://example.com",
        screenshot=None,
        app="web",
    )


def test_area_get_returns_explanation_when_value_is_none(mock_area: Area):
    """Test that Area.get() returns the explanation when value is None."""
    mock_area.client.retrieve.return_value = ("No data found", None)  # type: ignore[method-assign]

    result = mock_area.get("missing element")

    assert result == "No data found"
