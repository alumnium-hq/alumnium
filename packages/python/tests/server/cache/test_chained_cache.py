from unittest.mock import Mock

import pytest
from langchain_core.messages import AIMessage

from alumnium.server.cache.chained_cache import ChainedCache


@pytest.fixture
def mock_cache_1():
    """Create first mock cache."""
    cache = Mock()
    cache.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    return cache


@pytest.fixture
def mock_cache_2():
    """Create second mock cache."""
    cache = Mock()
    cache.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    return cache


@pytest.fixture
def mock_cache_3():
    """Create third mock cache."""
    cache = Mock()
    cache.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    return cache


def create_mock_response():
    """Create a mock response."""
    message = Mock(spec=AIMessage)
    message.content = "test response"
    message.usage_metadata = {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150}
    return [message]


class TestChainedCacheBasics:
    """Test basic chained cache operations."""

    def test_initialization(self, mock_cache_1, mock_cache_2):
        """Test chained cache initializes correctly."""
        chained = ChainedCache([mock_cache_1, mock_cache_2])

        assert len(chained.caches) == 2
        assert chained.caches[0] == mock_cache_1
        assert chained.caches[1] == mock_cache_2
        assert chained.usage == {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    def test_empty_cache_list(self):
        """Test chained cache with empty cache list."""
        chained = ChainedCache([])
        assert len(chained.caches) == 0


class TestChainedCacheLookup:
    """Test chained cache lookup behavior."""

    def test_lookup_first_cache_hit(self, mock_cache_1, mock_cache_2):
        """Test lookup returns from first cache on hit."""
        response = create_mock_response()
        mock_cache_1.lookup.return_value = response
        mock_cache_1.usage = {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}
        mock_cache_2.lookup.return_value = None

        chained = ChainedCache([mock_cache_1, mock_cache_2])
        result = chained.lookup("prompt", "llm_string")

        assert result == response
        mock_cache_1.lookup.assert_called_once_with("prompt", "llm_string")
        mock_cache_2.lookup.assert_not_called()

    def test_lookup_second_cache_hit(self, mock_cache_1, mock_cache_2):
        """Test lookup falls through to second cache."""
        response = create_mock_response()
        mock_cache_1.lookup.return_value = None
        mock_cache_2.lookup.return_value = response
        mock_cache_2.usage = {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}

        chained = ChainedCache([mock_cache_1, mock_cache_2])
        result = chained.lookup("prompt", "llm_string")

        assert result == response
        mock_cache_1.lookup.assert_called_once_with("prompt", "llm_string")
        mock_cache_2.lookup.assert_called_once_with("prompt", "llm_string")

    def test_lookup_all_caches_miss(self, mock_cache_1, mock_cache_2, mock_cache_3):
        """Test lookup returns None when all caches miss."""
        mock_cache_1.lookup.return_value = None
        mock_cache_2.lookup.return_value = None
        mock_cache_3.lookup.return_value = None

        chained = ChainedCache([mock_cache_1, mock_cache_2, mock_cache_3])
        result = chained.lookup("prompt", "llm_string")

        assert result is None
        mock_cache_1.lookup.assert_called_once_with("prompt", "llm_string")
        mock_cache_2.lookup.assert_called_once_with("prompt", "llm_string")
        mock_cache_3.lookup.assert_called_once_with("prompt", "llm_string")

    def test_lookup_stops_at_first_hit(self, mock_cache_1, mock_cache_2, mock_cache_3):
        """Test lookup stops checking after first hit."""
        response = create_mock_response()
        mock_cache_1.lookup.return_value = None
        mock_cache_2.lookup.return_value = response
        mock_cache_2.usage = {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}
        mock_cache_3.lookup.return_value = response

        chained = ChainedCache([mock_cache_1, mock_cache_2, mock_cache_3])
        result = chained.lookup("prompt", "llm_string")

        assert result == response
        mock_cache_1.lookup.assert_called_once()
        mock_cache_2.lookup.assert_called_once()
        mock_cache_3.lookup.assert_not_called()


class TestChainedCacheUpdate:
    """Test chained cache update behavior."""

    def test_update_all_caches(self, mock_cache_1, mock_cache_2, mock_cache_3):
        """Test update calls all caches."""
        response = create_mock_response()
        chained = ChainedCache([mock_cache_1, mock_cache_2, mock_cache_3])

        chained.update("prompt", "llm_string", response)

        mock_cache_1.update.assert_called_once_with("prompt", "llm_string", response)
        mock_cache_2.update.assert_called_once_with("prompt", "llm_string", response)
        mock_cache_3.update.assert_called_once_with("prompt", "llm_string", response)

    def test_update_with_empty_cache_list(self):
        """Test update with no caches doesn't crash."""
        chained = ChainedCache([])
        response = create_mock_response()
        chained.update("prompt", "llm_string", response)  # Should not raise


class TestChainedCacheSave:
    """Test chained cache save behavior."""

    def test_save_all_caches(self, mock_cache_1, mock_cache_2):
        """Test save calls all caches."""
        chained = ChainedCache([mock_cache_1, mock_cache_2])
        chained.save()

        mock_cache_1.save.assert_called_once()
        mock_cache_2.save.assert_called_once()


class TestChainedCacheDiscard:
    """Test chained cache discard behavior."""

    def test_discard_all_caches(self, mock_cache_1, mock_cache_2):
        """Test discard calls all caches."""
        chained = ChainedCache([mock_cache_1, mock_cache_2])
        chained.discard()

        mock_cache_1.discard.assert_called_once()
        mock_cache_2.discard.assert_called_once()


class TestChainedCacheClear:
    """Test chained cache clear behavior."""

    def test_clear_all_caches(self, mock_cache_1, mock_cache_2):
        """Test clear calls all caches."""
        chained = ChainedCache([mock_cache_1, mock_cache_2])
        chained.clear()

        mock_cache_1.clear.assert_called_once()
        mock_cache_2.clear.assert_called_once()

    def test_clear_with_kwargs(self, mock_cache_1, mock_cache_2):
        """Test clear passes kwargs to all caches."""
        chained = ChainedCache([mock_cache_1, mock_cache_2])
        chained.clear(arg1="value1", arg2="value2")

        mock_cache_1.clear.assert_called_once_with(arg1="value1", arg2="value2")
        mock_cache_2.clear.assert_called_once_with(arg1="value1", arg2="value2")


class TestChainedCacheUsageAggregation:
    """Test usage statistics aggregation."""

    def test_usage_aggregation_on_hit(self, mock_cache_1, mock_cache_2):
        """Test usage is aggregated from cache that had hit."""
        response = create_mock_response()
        mock_cache_1.lookup.return_value = None
        mock_cache_2.lookup.return_value = response
        mock_cache_2.usage = {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150}

        chained = ChainedCache([mock_cache_1, mock_cache_2])
        chained.lookup("prompt", "llm_string")

        assert chained.usage["input_tokens"] == 100
        assert chained.usage["output_tokens"] == 50
        assert chained.usage["total_tokens"] == 150

    def test_usage_aggregation_multiple_hits(self, mock_cache_1, mock_cache_2):
        """Test usage is replaced on each hit, not accumulated."""
        response = create_mock_response()
        mock_cache_1.lookup.return_value = response
        mock_cache_1.usage = {"input_tokens": 50, "output_tokens": 25, "total_tokens": 75}

        chained = ChainedCache([mock_cache_1, mock_cache_2])

        # First lookup
        chained.lookup("prompt1", "llm_string")
        assert chained.usage["input_tokens"] == 50
        assert chained.usage["output_tokens"] == 25
        assert chained.usage["total_tokens"] == 75

        # Second lookup - usage should be replaced, not accumulated
        mock_cache_1.usage = {"input_tokens": 60, "output_tokens": 30, "total_tokens": 90}
        chained.lookup("prompt2", "llm_string")
        assert chained.usage["input_tokens"] == 60
        assert chained.usage["output_tokens"] == 30
        assert chained.usage["total_tokens"] == 90

    def test_no_usage_on_miss(self, mock_cache_1, mock_cache_2):
        """Test usage not updated on cache miss."""
        mock_cache_1.lookup.return_value = None
        mock_cache_2.lookup.return_value = None

        chained = ChainedCache([mock_cache_1, mock_cache_2])
        chained.lookup("prompt", "llm_string")

        assert chained.usage["input_tokens"] == 0
        assert chained.usage["output_tokens"] == 0
        assert chained.usage["total_tokens"] == 0


class TestChainedCacheOrdering:
    """Test that cache ordering matters."""

    def test_cache_order_matters(self):
        """Test that cache order affects which one is checked first."""
        cache_a = Mock()
        cache_b = Mock()
        response_a = create_mock_response()
        response_b = create_mock_response()

        cache_a.lookup.return_value = response_a
        cache_b.lookup.return_value = response_b
        cache_a.usage = {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}
        cache_b.usage = {"input_tokens": 20, "output_tokens": 10, "total_tokens": 30}

        # A first
        chained_1 = ChainedCache([cache_a, cache_b])
        result_1 = chained_1.lookup("prompt", "llm_string")
        assert result_1 == response_a
        cache_b.lookup.assert_not_called()

        cache_a.reset_mock()
        cache_b.reset_mock()

        # B first
        chained_2 = ChainedCache([cache_b, cache_a])
        result_2 = chained_2.lookup("prompt", "llm_string")
        assert result_2 == response_b
        cache_a.lookup.assert_not_called()


class TestChainedCacheIntegration:
    """Integration tests with real cache behavior."""

    def test_filesystem_then_fragments_pattern(self):
        """Test typical usage pattern: FilesystemCache → FragmentsCache."""
        # Create two mock caches simulating filesystem and fragments
        filesystem_cache = Mock()
        fragments_cache = Mock()

        filesystem_cache.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        fragments_cache.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

        # Filesystem miss, fragments hit
        response = create_mock_response()
        filesystem_cache.lookup.return_value = None
        fragments_cache.lookup.return_value = response
        fragments_cache.usage = {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150}

        chained = ChainedCache([filesystem_cache, fragments_cache])

        # First call - fragments hit
        result = chained.lookup("prompt", "llm_string")
        assert result == response
        filesystem_cache.lookup.assert_called_once()
        fragments_cache.lookup.assert_called_once()

        # Update should go to both
        chained.update("new_prompt", "llm_string", response)
        filesystem_cache.update.assert_called_once()
        fragments_cache.update.assert_called_once()

        # Save should affect both
        chained.save()
        filesystem_cache.save.assert_called_once()
        fragments_cache.save.assert_called_once()
