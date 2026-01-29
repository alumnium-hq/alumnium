"""Integration tests for MCP tab management handlers using real Playwright browser."""

import asyncio
from pathlib import Path
from threading import Thread

import pytest

from alumnium.mcp import handlers, state


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


class TestListTabsIntegration:
    """Integration tests for list_tabs with real browser."""

    @pytest.mark.asyncio
    async def test_list_single_tab(self, registered_driver):
        """Test listing tabs when only one tab is open."""
        driver_id, mock_al, page, loop = registered_driver

        # Navigate to a page
        async def _navigate():
            await page.goto("data:text/html,<h1>Test Page</h1>")

        future = asyncio.run_coroutine_threadsafe(_navigate(), loop)
        future.result(timeout=10)

        result = await handlers.handle_list_tabs({"driver_id": driver_id})

        assert len(result) == 1
        assert "1 open tab" in result[0]["text"]
        assert "(active)" in result[0]["text"]

    @pytest.mark.asyncio
    async def test_list_multiple_tabs(self, registered_driver):
        """Test listing tabs when multiple tabs are open."""
        driver_id, mock_al, page, loop = registered_driver

        async def _setup_tabs():
            # Navigate first tab
            await page.goto("data:text/html,<title>Tab 1</title><h1>First Tab</h1>")
            # Open second tab
            context = page.context
            page2 = await context.new_page()
            await page2.goto("data:text/html,<title>Tab 2</title><h1>Second Tab</h1>")
            return page2

        future = asyncio.run_coroutine_threadsafe(_setup_tabs(), loop)
        future.result(timeout=10)

        result = await handlers.handle_list_tabs({"driver_id": driver_id})

        assert len(result) == 1
        assert "2 open tab" in result[0]["text"]
        assert "Tab 1" in result[0]["text"]
        assert "Tab 2" in result[0]["text"]


class TestSwitchTabIntegration:
    """Integration tests for switch_tab with real browser."""

    @pytest.mark.asyncio
    async def test_switch_to_second_tab(self, registered_driver):
        """Test switching from first tab to second tab."""
        driver_id, mock_al, page, loop = registered_driver

        async def _setup_tabs():
            await page.goto("data:text/html,<title>Tab 1</title><h1>First Tab</h1>")
            context = page.context
            page2 = await context.new_page()
            await page2.goto("data:text/html,<title>Tab 2</title><h1>Second Tab</h1>")
            return page2

        future = asyncio.run_coroutine_threadsafe(_setup_tabs(), loop)
        page2 = future.result(timeout=10)

        # Switch to tab 1 (second tab, 0-indexed)
        result = await handlers.handle_switch_tab({"driver_id": driver_id, "tab_index": 1})

        assert "Switched to tab [1]" in result[0]["text"]
        assert "Tab 2" in result[0]["text"]
        # Verify the driver's page was updated
        assert mock_al.driver.page == page2

    @pytest.mark.asyncio
    async def test_switch_back_to_first_tab(self, registered_driver):
        """Test switching back to the first tab."""
        driver_id, mock_al, page, loop = registered_driver

        async def _setup_tabs():
            await page.goto("data:text/html,<title>Tab 1</title><h1>First Tab</h1>")
            context = page.context
            page2 = await context.new_page()
            await page2.goto("data:text/html,<title>Tab 2</title><h1>Second Tab</h1>")
            # Start on second tab
            mock_al.driver.page = page2
            return page, page2

        future = asyncio.run_coroutine_threadsafe(_setup_tabs(), loop)
        page1, page2 = future.result(timeout=10)

        # Switch back to tab 0 (first tab)
        result = await handlers.handle_switch_tab({"driver_id": driver_id, "tab_index": 0})

        assert "Switched to tab [0]" in result[0]["text"]
        assert "Tab 1" in result[0]["text"]


class TestWaitForElementIntegration:
    """Integration tests for wait_for_element with real browser."""

    @pytest.mark.asyncio
    async def test_wait_for_existing_element(self, registered_driver):
        """Test waiting for an element that already exists."""
        driver_id, mock_al, page, loop = registered_driver

        async def _navigate():
            await page.goto("data:text/html,<div id='target'>Hello</div>")

        future = asyncio.run_coroutine_threadsafe(_navigate(), loop)
        future.result(timeout=10)

        result = await handlers.handle_wait_for_element({
            "driver_id": driver_id,
            "selector": "#target",
            "timeout": 5,
        })

        assert "Element found" in result[0]["text"]

    @pytest.mark.asyncio
    async def test_wait_for_delayed_element(self, registered_driver):
        """Test waiting for an element that appears after a delay."""
        driver_id, mock_al, page, loop = registered_driver

        html = """
        <script>
            setTimeout(function() {
                var div = document.createElement('div');
                div.id = 'delayed';
                div.textContent = 'Appeared!';
                document.body.appendChild(div);
            }, 500);
        </script>
        """

        async def _navigate():
            await page.goto(f"data:text/html,{html}")

        future = asyncio.run_coroutine_threadsafe(_navigate(), loop)
        future.result(timeout=10)

        result = await handlers.handle_wait_for_element({
            "driver_id": driver_id,
            "selector": "#delayed",
            "timeout": 5,
        })

        assert "Element found" in result[0]["text"]

    @pytest.mark.asyncio
    async def test_wait_for_nonexistent_element_times_out(self, registered_driver):
        """Test that waiting for a nonexistent element times out."""
        driver_id, mock_al, page, loop = registered_driver

        async def _navigate():
            await page.goto("data:text/html,<div>No target here</div>")

        future = asyncio.run_coroutine_threadsafe(_navigate(), loop)
        future.result(timeout=10)

        result = await handlers.handle_wait_for_element({
            "driver_id": driver_id,
            "selector": "#nonexistent",
            "timeout": 1,  # Short timeout for faster test
        })

        assert "Timeout" in result[0]["text"]


# Note: autoswitch_to_new_tab behavior is tested in unit tests (test_handlers.py)
# Integration tests for the full PlaywrightAsyncDriver are complex due to CDP session
# management and are covered by the existing examples/pytest/tabs_test.py
