"""Unit tests for tab switching in PlaywrightAsyncDriver."""

import asyncio
from threading import Thread
from unittest.mock import AsyncMock, MagicMock

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


def create_mock_context():
    """Create a mock context."""
    context = MagicMock()
    context.on = MagicMock()
    return context


def create_mock_pages(num_pages):
    """Create mock pages with a shared context."""
    context = create_mock_context()
    pages = []
    for i in range(num_pages):
        page = MagicMock()
        page.context = context
        page.title = MagicMock(return_value=f"Tab {i + 1}")
        page.on = MagicMock()
        page.wait_for_timeout = AsyncMock()  # Mock async wait
        pages.append(page)
    return pages


def create_driver_with_pages(pages, current_page_index, loop):
    """Create a driver and manually set up _pages to simulate tracked pages."""
    driver = PlaywrightAsyncDriver(pages[current_page_index], loop)
    # Override _pages to include all mock pages (simulating pages opened via events)
    driver._pages = pages
    return driver


class TestSwitchToNextTab:
    """Unit tests for switch_to_next_tab."""

    def test_switch_to_next_tab_basic(self, event_loop_in_thread):
        """Test switching from first tab to second tab."""
        pages = create_mock_pages(2)
        page1, page2 = pages

        driver = create_driver_with_pages(pages, 0, event_loop_in_thread)
        assert driver.page == page1

        driver.switch_to_next_tab()

        assert driver.page == page2

    def test_switch_to_next_tab_wraps_to_first(self, event_loop_in_thread):
        """Test that switching next on last tab wraps to first."""
        pages = create_mock_pages(2)
        page1, page2 = pages

        # Start on last tab
        driver = create_driver_with_pages(pages, 1, event_loop_in_thread)
        assert driver.page == page2

        driver.switch_to_next_tab()

        # Should wrap to first
        assert driver.page == page1

    def test_switch_to_next_tab_single_tab_noop(self, event_loop_in_thread):
        """Test that switching next with only one tab is a no-op."""
        pages = create_mock_pages(1)
        page1 = pages[0]

        driver = create_driver_with_pages(pages, 0, event_loop_in_thread)
        original_page = driver.page

        driver.switch_to_next_tab()

        assert driver.page == original_page

    def test_switch_to_next_tab_three_tabs(self, event_loop_in_thread):
        """Test cycling through three tabs."""
        pages = create_mock_pages(3)
        page1, page2, page3 = pages

        driver = create_driver_with_pages(pages, 0, event_loop_in_thread)

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
        pages = create_mock_pages(2)
        page1, page2 = pages

        # Start on second tab
        driver = create_driver_with_pages(pages, 1, event_loop_in_thread)
        assert driver.page == page2

        driver.switch_to_previous_tab()

        assert driver.page == page1

    def test_switch_to_previous_tab_wraps_to_last(self, event_loop_in_thread):
        """Test that switching previous on first tab wraps to last."""
        pages = create_mock_pages(2)
        page1, page2 = pages

        # Start on first tab
        driver = create_driver_with_pages(pages, 0, event_loop_in_thread)
        assert driver.page == page1

        driver.switch_to_previous_tab()

        # Should wrap to last
        assert driver.page == page2

    def test_switch_to_previous_tab_single_tab_noop(self, event_loop_in_thread):
        """Test that switching previous with only one tab is a no-op."""
        pages = create_mock_pages(1)
        page1 = pages[0]

        driver = create_driver_with_pages(pages, 0, event_loop_in_thread)
        original_page = driver.page

        driver.switch_to_previous_tab()

        assert driver.page == original_page

    def test_switch_to_previous_tab_three_tabs(self, event_loop_in_thread):
        """Test cycling backwards through three tabs."""
        pages = create_mock_pages(3)
        page1, page2, page3 = pages

        driver = create_driver_with_pages(pages, 2, event_loop_in_thread)

        driver.switch_to_previous_tab()
        assert driver.page == page2

        driver.switch_to_previous_tab()
        assert driver.page == page1

        driver.switch_to_previous_tab()
        assert driver.page == page3  # Wrapped back
