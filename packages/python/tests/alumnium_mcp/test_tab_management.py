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


class TestPopupTracking:
    """Unit tests for popup/new tab tracking."""

    def test_popup_sync_handler_adds_page_to_list(self, event_loop_in_thread):
        """Test that _on_popup_sync adds the popup page to _pages list."""
        pages = create_mock_pages(1)
        driver = create_driver_with_pages(pages, 0, event_loop_in_thread)

        assert len(driver._pages) == 1

        # Simulate a popup opening
        popup_page = MagicMock()
        popup_page.url = "https://example.com/popup"
        popup_page.on = MagicMock()

        driver._on_popup_sync(popup_page)

        assert len(driver._pages) == 2
        assert driver._pages[1] == popup_page

    def test_popup_sync_handler_attaches_listeners_to_new_page(self, event_loop_in_thread):
        """Test that _on_popup_sync attaches popup/close listeners to new page."""
        pages = create_mock_pages(1)
        driver = create_driver_with_pages(pages, 0, event_loop_in_thread)

        popup_page = MagicMock()
        popup_page.url = "https://example.com/popup"
        popup_page.on = MagicMock()

        driver._on_popup_sync(popup_page)

        # Verify listeners were attached (popup and close)
        assert popup_page.on.call_count == 2
        call_args = [call[0][0] for call in popup_page.on.call_args_list]
        assert "popup" in call_args
        assert "close" in call_args

    def test_popup_sync_handler_is_synchronous(self, event_loop_in_thread):
        """Test that _on_popup_sync is a regular sync method (not async)."""
        pages = create_mock_pages(1)
        driver = create_driver_with_pages(pages, 0, event_loop_in_thread)

        # Verify it's not a coroutine function
        import asyncio
        assert not asyncio.iscoroutinefunction(driver._on_popup_sync)

    def test_popup_chain_tracking(self, event_loop_in_thread):
        """Test that popups from popups are also tracked (chained)."""
        pages = create_mock_pages(1)
        driver = create_driver_with_pages(pages, 0, event_loop_in_thread)

        # First popup
        popup1 = MagicMock()
        popup1.url = "https://example.com/popup1"
        popup1.on = MagicMock()
        driver._on_popup_sync(popup1)

        # Second popup (from first popup) - simulate by calling handler again
        popup2 = MagicMock()
        popup2.url = "https://example.com/popup2"
        popup2.on = MagicMock()
        driver._on_popup_sync(popup2)

        assert len(driver._pages) == 3
        assert driver._pages[1] == popup1
        assert driver._pages[2] == popup2


class TestPageCloseTracking:
    """Unit tests for page close tracking."""

    def test_page_close_removes_from_list(self, event_loop_in_thread):
        """Test that _on_page_close removes the page from _pages list."""
        pages = create_mock_pages(2)
        driver = create_driver_with_pages(pages, 0, event_loop_in_thread)
        page_to_close = pages[1]  # Save reference before removal

        assert len(driver._pages) == 2

        # Simulate page close
        driver._on_page_close(page_to_close)

        assert len(driver._pages) == 1
        assert page_to_close not in driver._pages

    def test_page_close_ignores_unknown_page(self, event_loop_in_thread):
        """Test that _on_page_close ignores pages not in _pages list."""
        pages = create_mock_pages(1)
        driver = create_driver_with_pages(pages, 0, event_loop_in_thread)

        unknown_page = MagicMock()
        unknown_page.url = "https://unknown.com"

        # Should not raise, just ignore
        driver._on_page_close(unknown_page)

        assert len(driver._pages) == 1
