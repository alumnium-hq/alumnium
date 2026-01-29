"""Tests for MCP handlers."""

import asyncio
from threading import Thread
from unittest.mock import MagicMock, patch

import pytest

from alumnium.mcp import handlers


class TestHandleWait:
    """Tests for the wait handler."""

    @pytest.mark.asyncio
    async def test_wait_returns_after_specified_seconds(self):
        """Test that wait returns the correct message."""
        result = await handlers.handle_wait({"seconds": 1})
        assert len(result) == 1
        assert result[0]["type"] == "text"
        assert result[0]["text"] == "Waited 1 seconds"

    @pytest.mark.asyncio
    async def test_wait_clamps_to_minimum(self):
        """Test that wait clamps to minimum of 1 second."""
        result = await handlers.handle_wait({"seconds": 0})
        assert "Waited 1 seconds" in result[0]["text"]

    @pytest.mark.asyncio
    async def test_wait_clamps_to_maximum(self):
        """Test that wait clamps to maximum of 30 seconds."""
        # We don't actually wait 30s in the test - we just verify the clamping logic
        # by checking the message after a quick wait
        result = await handlers.handle_wait({"seconds": 100})
        assert "Waited 30 seconds" in result[0]["text"]


def create_running_loop():
    """Create an event loop running in a separate thread (like Playwright uses)."""
    loop = asyncio.new_event_loop()
    thread = Thread(target=lambda: asyncio.set_event_loop(loop) or loop.run_forever(), daemon=True)
    thread.start()
    return loop


class TestHandleListTabs:
    """Tests for the list_tabs handler."""

    @pytest.mark.asyncio
    async def test_list_tabs_non_playwright_driver(self):
        """Test that list_tabs returns appropriate message for non-Playwright drivers."""
        mock_al = MagicMock()
        mock_selenium_driver = MagicMock()

        with patch.object(handlers.state, "get_driver", return_value=(mock_al, mock_selenium_driver)):
            result = await handlers.handle_list_tabs({"driver_id": "test-123"})

        assert len(result) == 1
        assert result[0]["type"] == "text"
        assert "currently only supported for Playwright" in result[0]["text"]

    @pytest.mark.asyncio
    async def test_list_tabs_playwright_driver(self):
        """Test that list_tabs returns tab info for Playwright drivers."""
        mock_al = MagicMock()
        mock_page = MagicMock()
        mock_page.__class__.__name__ = "Page"
        mock_page.url = "https://example.com"

        # Mock the title() coroutine
        async def mock_title():
            return "Example Page"

        mock_page.title = mock_title

        # Set up context with pages
        mock_context = MagicMock()
        mock_context.pages = [mock_page]
        mock_page.context = mock_context

        # Set up the driver tuple
        mock_al.driver = MagicMock()
        mock_al.driver.page = mock_page

        # Create a running event loop (like Playwright uses)
        loop = create_running_loop()

        try:
            with patch.object(handlers.state, "get_driver", return_value=(mock_al, (mock_page, loop))):
                result = await handlers.handle_list_tabs({"driver_id": "test-123"})

            assert len(result) == 1
            assert result[0]["type"] == "text"
            assert "1 open tab" in result[0]["text"]
            assert "Example Page" in result[0]["text"]
            assert "https://example.com" in result[0]["text"]
        finally:
            loop.call_soon_threadsafe(loop.stop)


class TestHandleSwitchTab:
    """Tests for the switch_tab handler."""

    @pytest.mark.asyncio
    async def test_switch_tab_non_playwright_driver(self):
        """Test that switch_tab returns appropriate message for non-Playwright drivers."""
        mock_al = MagicMock()
        mock_selenium_driver = MagicMock()

        with patch.object(handlers.state, "get_driver", return_value=(mock_al, mock_selenium_driver)):
            result = await handlers.handle_switch_tab({"driver_id": "test-123", "tab_index": 0})

        assert len(result) == 1
        assert result[0]["type"] == "text"
        assert "currently only supported for Playwright" in result[0]["text"]

    @pytest.mark.asyncio
    async def test_switch_tab_playwright_driver(self):
        """Test that switch_tab works for Playwright drivers."""
        mock_al = MagicMock()
        mock_page = MagicMock()
        mock_page.__class__.__name__ = "Page"
        mock_page.url = "https://example.com/page2"

        # Mock the title() coroutine
        async def mock_title():
            return "Page 2"

        mock_page.title = mock_title

        # Set up context with multiple pages
        mock_context = MagicMock()
        mock_context.pages = [MagicMock(), mock_page]  # Two pages, we'll switch to index 1
        mock_page.context = mock_context

        # Set up the driver
        mock_al.driver = MagicMock()

        # Create a running event loop
        loop = create_running_loop()

        try:
            with patch.object(handlers.state, "get_driver", return_value=(mock_al, (mock_page, loop))):
                result = await handlers.handle_switch_tab({"driver_id": "test-123", "tab_index": 1})

            assert len(result) == 1
            assert result[0]["type"] == "text"
            assert "Switched to tab [1]" in result[0]["text"]
            assert "Page 2" in result[0]["text"]
            assert "https://example.com/page2" in result[0]["text"]
        finally:
            loop.call_soon_threadsafe(loop.stop)

    @pytest.mark.asyncio
    async def test_switch_tab_invalid_index(self):
        """Test that switch_tab handles invalid tab index."""
        mock_al = MagicMock()
        mock_page = MagicMock()
        mock_page.__class__.__name__ = "Page"

        # Set up context with one page
        mock_context = MagicMock()
        mock_context.pages = [mock_page]
        mock_page.context = mock_context

        # Set up the driver
        mock_al.driver = MagicMock()

        # Create a running event loop
        loop = create_running_loop()

        try:
            with patch.object(handlers.state, "get_driver", return_value=(mock_al, (mock_page, loop))):
                # Try to switch to tab index 5 when only 1 tab exists
                with pytest.raises(ValueError) as exc_info:
                    await handlers.handle_switch_tab({"driver_id": "test-123", "tab_index": 5})

                assert "Invalid tab index" in str(exc_info.value)
        finally:
            loop.call_soon_threadsafe(loop.stop)


class TestHandleWaitForElement:
    """Tests for the wait_for_element handler."""

    @pytest.mark.asyncio
    async def test_wait_for_element_non_playwright_driver(self):
        """Test that wait_for_element returns appropriate message for non-Playwright drivers."""
        mock_al = MagicMock()
        mock_selenium_driver = MagicMock()

        with patch.object(handlers.state, "get_driver", return_value=(mock_al, mock_selenium_driver)):
            result = await handlers.handle_wait_for_element({
                "driver_id": "test-123",
                "selector": "#my-element",
                "timeout": 5,
            })

        assert len(result) == 1
        assert result[0]["type"] == "text"
        assert "currently only supported for Playwright" in result[0]["text"]

    @pytest.mark.asyncio
    async def test_wait_for_element_found(self):
        """Test that wait_for_element returns success when element is found."""
        mock_al = MagicMock()
        mock_page = MagicMock()
        mock_page.__class__.__name__ = "Page"

        # Mock wait_for_selector to succeed
        async def mock_wait_for_selector(selector, timeout=None):
            return MagicMock()  # Return a locator

        mock_page.wait_for_selector = mock_wait_for_selector
        mock_al.driver = MagicMock()
        mock_al.driver.page = mock_page

        # Create a running event loop
        loop = create_running_loop()

        try:
            with patch.object(handlers.state, "get_driver", return_value=(mock_al, (mock_page, loop))):
                result = await handlers.handle_wait_for_element({
                    "driver_id": "test-123",
                    "selector": "#my-element",
                    "timeout": 5,
                })

            assert len(result) == 1
            assert result[0]["type"] == "text"
            assert "Element found" in result[0]["text"]
            assert "#my-element" in result[0]["text"]
        finally:
            loop.call_soon_threadsafe(loop.stop)

    @pytest.mark.asyncio
    async def test_wait_for_element_timeout(self):
        """Test that wait_for_element returns timeout message when element not found."""
        mock_al = MagicMock()
        mock_page = MagicMock()
        mock_page.__class__.__name__ = "Page"

        # Mock wait_for_selector to timeout
        async def mock_wait_for_selector(selector, timeout=None):
            raise Exception("Timeout 5000ms exceeded")

        mock_page.wait_for_selector = mock_wait_for_selector
        mock_al.driver = MagicMock()
        mock_al.driver.page = mock_page

        # Create a running event loop
        loop = create_running_loop()

        try:
            with patch.object(handlers.state, "get_driver", return_value=(mock_al, (mock_page, loop))):
                result = await handlers.handle_wait_for_element({
                    "driver_id": "test-123",
                    "selector": "#missing-element",
                    "timeout": 5,
                })

            assert len(result) == 1
            assert result[0]["type"] == "text"
            assert "Timeout" in result[0]["text"]
            assert "#missing-element" in result[0]["text"]
        finally:
            loop.call_soon_threadsafe(loop.stop)

    @pytest.mark.asyncio
    async def test_wait_for_element_default_timeout(self):
        """Test that wait_for_element uses default timeout of 10 seconds."""
        mock_al = MagicMock()
        mock_page = MagicMock()
        mock_page.__class__.__name__ = "Page"

        captured_timeout = None

        async def mock_wait_for_selector(selector, timeout=None):
            nonlocal captured_timeout
            captured_timeout = timeout
            return MagicMock()

        mock_page.wait_for_selector = mock_wait_for_selector
        mock_al.driver = MagicMock()
        mock_al.driver.page = mock_page

        loop = create_running_loop()

        try:
            with patch.object(handlers.state, "get_driver", return_value=(mock_al, (mock_page, loop))):
                # Don't pass timeout - should use default of 10
                await handlers.handle_wait_for_element({
                    "driver_id": "test-123",
                    "selector": "#my-element",
                })

            assert captured_timeout == 10000  # 10 seconds in milliseconds
        finally:
            loop.call_soon_threadsafe(loop.stop)


