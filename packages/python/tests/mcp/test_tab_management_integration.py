"""Integration tests for tab switching in PlaywrightAsyncDriver."""

import asyncio
from pathlib import Path
from threading import Thread

import pytest

from alumnium.mcp import state


@pytest.fixture
def event_loop_in_thread():
    """Create an event loop running in a separate thread (like MCP server does)."""
    loop = asyncio.new_event_loop()
    thread = Thread(target=lambda: asyncio.set_event_loop(loop) or loop.run_forever(), daemon=True)
    thread.start()
    yield loop
    loop.call_soon_threadsafe(loop.stop)


@pytest.fixture
def playwright_page(event_loop_in_thread):
    """Create a real Playwright page for testing."""
    from playwright.async_api import async_playwright

    loop = event_loop_in_thread
    page = None
    playwright_instance = None
    browser = None
    context = None

    async def _setup():
        nonlocal page, playwright_instance, browser, context
        playwright_instance = await async_playwright().start()
        browser = await playwright_instance.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        return page

    future = asyncio.run_coroutine_threadsafe(_setup(), loop)
    page = future.result(timeout=30)

    yield (page, loop, context)

    # Cleanup
    async def _teardown():
        await browser.close()
        await playwright_instance.stop()

    future = asyncio.run_coroutine_threadsafe(_teardown(), loop)
    future.result(timeout=10)


@pytest.fixture
def mock_alumnium(playwright_page):
    """Create a mock Alumnium instance with the Playwright page."""
    from unittest.mock import MagicMock

    page, loop, context = playwright_page

    mock_al = MagicMock()
    mock_al.driver = MagicMock()
    mock_al.driver.page = page

    return mock_al, page, loop


@pytest.fixture
def registered_driver(mock_alumnium):
    """Register a driver in state for testing."""
    mock_al, page, loop = mock_alumnium
    driver_id = "test-integration-driver"

    # Register the driver
    state.drivers[driver_id] = (mock_al, (page, loop))
    state.artifacts_dirs[driver_id] = Path("/tmp/test-artifacts")
    state.step_counters[driver_id] = 1

    yield driver_id, mock_al, page, loop

    # Cleanup
    if driver_id in state.drivers:
        del state.drivers[driver_id]
    if driver_id in state.artifacts_dirs:
        del state.artifacts_dirs[driver_id]
    if driver_id in state.step_counters:
        del state.step_counters[driver_id]


class TestSwitchToNextTabIntegration:
    """Integration tests for switch_to_next_tab with real browser."""

    @pytest.mark.asyncio
    async def test_switch_to_next_tab_basic(self, registered_driver):
        """Test switching from first tab to second tab."""
        driver_id, mock_al, page, loop = registered_driver

        async def _setup_tabs():
            await page.goto("data:text/html,<title>Tab 1</title>")
            context = page.context
            page2 = await context.new_page()
            await page2.goto("data:text/html,<title>Tab 2</title>")
            # Start on first tab
            mock_al.driver.page = page
            return page, page2

        future = asyncio.run_coroutine_threadsafe(_setup_tabs(), loop)
        page1, page2 = future.result(timeout=10)

        # Create a real PlaywrightAsyncDriver for testing
        from alumnium.drivers.playwright_async_driver import PlaywrightAsyncDriver

        driver = PlaywrightAsyncDriver(page1, loop)

        driver.switch_to_next_tab()

        # Verify switched to second tab
        assert driver.page == page2

    @pytest.mark.asyncio
    async def test_switch_to_next_tab_wraps_to_first(self, registered_driver):
        """Test that switching next on last tab wraps to first."""
        driver_id, mock_al, page, loop = registered_driver

        async def _setup_tabs():
            await page.goto("data:text/html,<title>Tab 1</title>")
            context = page.context
            page2 = await context.new_page()
            await page2.goto("data:text/html,<title>Tab 2</title>")
            return page, page2

        future = asyncio.run_coroutine_threadsafe(_setup_tabs(), loop)
        page1, page2 = future.result(timeout=10)

        # Create a real PlaywrightAsyncDriver starting on LAST tab (second)
        from alumnium.drivers.playwright_async_driver import PlaywrightAsyncDriver

        driver = PlaywrightAsyncDriver(page2, loop)

        # Switch to next - should wrap to first
        driver.switch_to_next_tab()

        assert driver.page == page1

    @pytest.mark.asyncio
    async def test_switch_to_next_tab_single_tab_noop(self, registered_driver):
        """Test that switching next with only one tab is a no-op."""
        driver_id, mock_al, page, loop = registered_driver

        async def _navigate():
            await page.goto("data:text/html,<title>Only Tab</title>")

        future = asyncio.run_coroutine_threadsafe(_navigate(), loop)
        future.result(timeout=10)

        from alumnium.drivers.playwright_async_driver import PlaywrightAsyncDriver

        driver = PlaywrightAsyncDriver(page, loop)
        original_page = driver.page

        driver.switch_to_next_tab()

        # Should still be on same page
        assert driver.page == original_page


class TestSwitchToPreviousTabIntegration:
    """Integration tests for switch_to_previous_tab with real browser."""

    @pytest.mark.asyncio
    async def test_switch_to_previous_tab_basic(self, registered_driver):
        """Test switching from second tab to first tab."""
        driver_id, mock_al, page, loop = registered_driver

        async def _setup_tabs():
            await page.goto("data:text/html,<title>Tab 1</title>")
            context = page.context
            page2 = await context.new_page()
            await page2.goto("data:text/html,<title>Tab 2</title>")
            return page, page2

        future = asyncio.run_coroutine_threadsafe(_setup_tabs(), loop)
        page1, page2 = future.result(timeout=10)

        # Create a real PlaywrightAsyncDriver starting on second tab
        from alumnium.drivers.playwright_async_driver import PlaywrightAsyncDriver

        driver = PlaywrightAsyncDriver(page2, loop)

        driver.switch_to_previous_tab()

        assert driver.page == page1

    @pytest.mark.asyncio
    async def test_switch_to_previous_tab_wraps_to_last(self, registered_driver):
        """Test that switching previous on first tab wraps to last."""
        driver_id, mock_al, page, loop = registered_driver

        async def _setup_tabs():
            await page.goto("data:text/html,<title>Tab 1</title>")
            context = page.context
            page2 = await context.new_page()
            await page2.goto("data:text/html,<title>Tab 2</title>")
            return page, page2

        future = asyncio.run_coroutine_threadsafe(_setup_tabs(), loop)
        page1, page2 = future.result(timeout=10)

        # Create a real PlaywrightAsyncDriver starting on FIRST tab
        from alumnium.drivers.playwright_async_driver import PlaywrightAsyncDriver

        driver = PlaywrightAsyncDriver(page1, loop)

        driver.switch_to_previous_tab()

        # Should wrap to last tab
        assert driver.page == page2

    @pytest.mark.asyncio
    async def test_switch_to_previous_tab_single_tab_noop(self, registered_driver):
        """Test that switching previous with only one tab is a no-op."""
        driver_id, mock_al, page, loop = registered_driver

        async def _navigate():
            await page.goto("data:text/html,<title>Only Tab</title>")

        future = asyncio.run_coroutine_threadsafe(_navigate(), loop)
        future.result(timeout=10)

        from alumnium.drivers.playwright_async_driver import PlaywrightAsyncDriver

        driver = PlaywrightAsyncDriver(page, loop)
        original_page = driver.page

        driver.switch_to_previous_tab()

        assert driver.page == original_page


# Note: autoswitch_to_new_tab behavior is tested in unit tests (test_handlers.py)
# Integration tests for the full PlaywrightAsyncDriver are complex due to CDP session
# management and are covered by the existing examples/pytest/tabs_test.py
