"""Tests for MCP handlers."""

from unittest.mock import MagicMock, patch

import pytest

from alumnium.mcp import handlers


class TestHandleWait:
    """Tests for the unified wait handler."""

    @pytest.mark.asyncio
    async def test_wait_for_seconds(self):
        """Test that wait returns the correct message when given a number."""
        result = await handlers.handle_wait({"for": 1})
        assert len(result) == 1
        assert result[0]["type"] == "text"
        assert result[0]["text"] == "Waited 1 seconds"

    @pytest.mark.asyncio
    async def test_wait_clamps_to_minimum(self):
        """Test that wait clamps to minimum of 1 second."""
        result = await handlers.handle_wait({"for": 0})
        assert "Waited 1 seconds" in result[0]["text"]

    @pytest.mark.asyncio
    async def test_wait_clamps_to_maximum(self):
        """Test that wait clamps to maximum of 30 seconds."""
        result = await handlers.handle_wait({"for": 100})
        assert "Waited 30 seconds" in result[0]["text"]

    @pytest.mark.asyncio
    async def test_wait_for_condition_requires_driver_id(self):
        """Test that wait returns error when condition given without driver_id."""
        result = await handlers.handle_wait({"for": "user is logged in"})
        assert len(result) == 1
        assert "driver_id is required" in result[0]["text"]

    @pytest.mark.asyncio
    async def test_wait_for_condition_met_immediately(self):
        """Test that wait returns success when condition is met on first check."""
        mock_al = MagicMock()
        mock_al.check.return_value = "The condition is satisfied"

        with patch.object(handlers.state, "get_driver", return_value=(mock_al, MagicMock())):
            result = await handlers.handle_wait({
                "driver_id": "test-123",
                "for": "user is logged in",
                "timeout": 10,
            })

        assert len(result) == 1
        assert result[0]["type"] == "text"
        assert "Condition met" in result[0]["text"]
        assert "user is logged in" in result[0]["text"]
        mock_al.check.assert_called_once_with("user is logged in")

    @pytest.mark.asyncio
    async def test_wait_for_condition_met_after_retries(self):
        """Test that wait retries until condition is met."""
        mock_al = MagicMock()
        mock_al.check.side_effect = [
            AssertionError("Not yet"),
            AssertionError("Still not"),
            "The condition is now satisfied",
        ]

        with patch.object(handlers.state, "get_driver", return_value=(mock_al, MagicMock())):
            result = await handlers.handle_wait({
                "driver_id": "test-123",
                "for": "page loaded",
                "timeout": 10,
            })

        assert len(result) == 1
        assert "Condition met" in result[0]["text"]
        assert mock_al.check.call_count == 3

    @pytest.mark.asyncio
    async def test_wait_for_condition_timeout(self):
        """Test that wait returns timeout message when condition never met."""
        mock_al = MagicMock()
        mock_al.check.side_effect = AssertionError("Condition not satisfied")

        with patch.object(handlers.state, "get_driver", return_value=(mock_al, MagicMock())):
            result = await handlers.handle_wait({
                "driver_id": "test-123",
                "for": "element visible",
                "timeout": 0.3,
            })

        assert len(result) == 1
        assert "Timeout" in result[0]["text"]
        assert "element visible" in result[0]["text"]
        assert "Last check" in result[0]["text"]

    @pytest.mark.asyncio
    async def test_wait_for_condition_default_timeout(self):
        """Test that wait uses default timeout of 10 seconds."""
        mock_al = MagicMock()
        mock_al.check.return_value = "OK"

        with patch.object(handlers.state, "get_driver", return_value=(mock_al, MagicMock())):
            result = await handlers.handle_wait({
                "driver_id": "test-123",
                "for": "test condition",
            })

        assert "Condition met" in result[0]["text"]


