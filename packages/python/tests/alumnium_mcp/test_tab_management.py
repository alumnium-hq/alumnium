"""Unit tests for tab switching in PlaywrightAsyncDriver."""

import asyncio
from threading import Thread
from unittest.mock import AsyncMock, MagicMock, PropertyMock

import pytest

from alumnium.drivers.playwright_async_driver import PlaywrightAsyncDriver


@pytest.fixture
def event_loop_in_thread():
    """Create an event loop running in a separate thread (like MCP server does)."""
    loop = asyncio.new_event_loop()
    thread = Thread(target=lambda: asyncio.set_event_loop(loop) or loop.run_forever(), daemon=True)
    thread.start()
    yield loop
    loop.call_soon_threadsafe(loop.stop)


def create_mock_page(context, title="Mock Page"):
    """Create a mock Playwright page."""
    page = MagicMock()
    page.context = context
    page.title = MagicMock(return_value=title)
    return page


def create_mock_context(num_pages):
    """Create a mock context with the specified number of pages."""
    context = MagicMock()
    pages = []
    for i in range(num_pages):
        page = MagicMock()
        page.context = context
        page.title = MagicMock(return_value=f"Tab {i + 1}")
        pages.append(page)
    type(context).pages = PropertyMock(return_value=pages)
    return context, pages


class TestSwitchToNextTab:
    """Unit tests for switch_to_next_tab."""

    def test_switch_to_next_tab_basic(self, event_loop_in_thread):
        """Test switching from first tab to second tab."""
        context, pages = create_mock_context(2)
        page1, page2 = pages

        driver = PlaywrightAsyncDriver(page1, event_loop_in_thread)
        assert driver.page == page1

        driver.switch_to_next_tab()

        assert driver.page == page2

    def test_switch_to_next_tab_wraps_to_first(self, event_loop_in_thread):
        """Test that switching next on last tab wraps to first."""
        context, pages = create_mock_context(2)
        page1, page2 = pages

        # Start on last tab
        driver = PlaywrightAsyncDriver(page2, event_loop_in_thread)
        assert driver.page == page2

        driver.switch_to_next_tab()

        # Should wrap to first
        assert driver.page == page1

    def test_switch_to_next_tab_single_tab_noop(self, event_loop_in_thread):
        """Test that switching next with only one tab is a no-op."""
        context, pages = create_mock_context(1)
        page1 = pages[0]

        driver = PlaywrightAsyncDriver(page1, event_loop_in_thread)
        original_page = driver.page

        driver.switch_to_next_tab()

        assert driver.page == original_page

    def test_switch_to_next_tab_three_tabs(self, event_loop_in_thread):
        """Test cycling through three tabs."""
        context, pages = create_mock_context(3)
        page1, page2, page3 = pages

        driver = PlaywrightAsyncDriver(page1, event_loop_in_thread)

        driver.switch_to_next_tab()
        assert driver.page == page2

        driver.switch_to_next_tab()
        assert driver.page == page3

        driver.switch_to_next_tab()
        assert driver.page == page1  # Wrapped back


class TestSwitchToPreviousTab:
    """Unit tests for switch_to_previous_tab."""

    def test_switch_to_previous_tab_basic(self, event_loop_in_thread):
        """Test switching from second tab to first tab."""
        context, pages = create_mock_context(2)
        page1, page2 = pages

        # Start on second tab
        driver = PlaywrightAsyncDriver(page2, event_loop_in_thread)
        assert driver.page == page2

        driver.switch_to_previous_tab()

        assert driver.page == page1

    def test_switch_to_previous_tab_wraps_to_last(self, event_loop_in_thread):
        """Test that switching previous on first tab wraps to last."""
        context, pages = create_mock_context(2)
        page1, page2 = pages

        # Start on first tab
        driver = PlaywrightAsyncDriver(page1, event_loop_in_thread)
        assert driver.page == page1

        driver.switch_to_previous_tab()

        # Should wrap to last
        assert driver.page == page2

    def test_switch_to_previous_tab_single_tab_noop(self, event_loop_in_thread):
        """Test that switching previous with only one tab is a no-op."""
        context, pages = create_mock_context(1)
        page1 = pages[0]

        driver = PlaywrightAsyncDriver(page1, event_loop_in_thread)
        original_page = driver.page

        driver.switch_to_previous_tab()

        assert driver.page == original_page

    def test_switch_to_previous_tab_three_tabs(self, event_loop_in_thread):
        """Test cycling backwards through three tabs."""
        context, pages = create_mock_context(3)
        page1, page2, page3 = pages

        driver = PlaywrightAsyncDriver(page3, event_loop_in_thread)

        driver.switch_to_previous_tab()
        assert driver.page == page2

        driver.switch_to_previous_tab()
        assert driver.page == page1

        driver.switch_to_previous_tab()
        assert driver.page == page3  # Wrapped back
