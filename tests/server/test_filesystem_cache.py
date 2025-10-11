import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from alumnium.server.cache.filesystem_cache import FilesystemCache


@pytest.fixture
def temp_cache_dir():
    """Create a temporary cache directory for testing."""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def mock_model():
    """Mock the Model.current to avoid requiring a real model."""
    from alumnium.server.models import Model, Provider

    mock = MagicMock()
    mock.provider.value = "test_provider"
    mock.name = "test_model"

    # Store the original value
    original_current = getattr(Model, 'current', None)

    # Set the mock
    Model.current = mock

    yield mock

    # Restore the original value
    if original_current is not None:
        Model.current = original_current
    elif hasattr(Model, 'current'):
        delattr(Model, 'current')


def test_cache_save_and_lookup(temp_cache_dir, mock_model):
    """Test that cache can save and lookup entries correctly."""
    cache = FilesystemCache(cache_dir=temp_cache_dir)

    # Create a mock prompt and response
    prompt = json.dumps([
        {"kwargs": {"type": "system", "content": "You are a helpful assistant"}},
        {"kwargs": {"type": "human", "content": "Hello, world!"}}
    ])
    llm_string = "test_llm"

    # Create a mock return value
    mock_response = MagicMock()
    mock_response.message.usage_metadata = {
        "input_tokens": 10,
        "output_tokens": 20,
        "total_tokens": 30
    }
    return_val = [mock_response]

    # Update cache
    cache.update(prompt, llm_string, return_val)

    # Save cache (this should create lock files and clean them up)
    cache.save()

    # Verify that no lock files remain
    lock_files = list(Path(temp_cache_dir).rglob("*.lock"))
    assert len(lock_files) == 0, f"Lock files should be cleaned up, but found: {lock_files}"

    # Verify that response file was created
    response_files = list(Path(temp_cache_dir).rglob("response.json"))
    assert len(response_files) == 1, "Response file should be created"


def test_cache_concurrent_saves(temp_cache_dir, mock_model):
    """Test that multiple cache instances can save concurrently without errors."""
    # Create two cache instances
    cache1 = FilesystemCache(cache_dir=temp_cache_dir)
    cache2 = FilesystemCache(cache_dir=temp_cache_dir)

    # Create mock prompts and responses
    prompt1 = json.dumps([
        {"kwargs": {"type": "system", "content": "System"}},
        {"kwargs": {"type": "human", "content": "Message 1"}}
    ])
    prompt2 = json.dumps([
        {"kwargs": {"type": "system", "content": "System"}},
        {"kwargs": {"type": "human", "content": "Message 2"}}
    ])

    llm_string = "test_llm"

    mock_response1 = MagicMock()
    mock_response1.message.usage_metadata = {"input_tokens": 10, "output_tokens": 20, "total_tokens": 30}

    mock_response2 = MagicMock()
    mock_response2.message.usage_metadata = {"input_tokens": 15, "output_tokens": 25, "total_tokens": 40}

    # Update both caches
    cache1.update(prompt1, llm_string, [mock_response1])
    cache2.update(prompt2, llm_string, [mock_response2])

    # Save both caches (simulating concurrent access)
    cache1.save()
    cache2.save()

    # Verify that no lock files remain
    lock_files = list(Path(temp_cache_dir).rglob("*.lock"))
    assert len(lock_files) == 0, f"Lock files should be cleaned up after both saves, but found: {lock_files}"


def test_cache_lookup_after_save(temp_cache_dir, mock_model):
    """Test that save() cleans up lock files properly."""
    cache1 = FilesystemCache(cache_dir=temp_cache_dir)

    # Create a mock prompt and response
    prompt = json.dumps([
        {"kwargs": {"type": "system", "content": "System message"}},
        {"kwargs": {"type": "human", "content": "Test message"}}
    ])
    llm_string = "test_llm"

    mock_response = MagicMock()
    mock_response.message.usage_metadata = {"input_tokens": 10, "output_tokens": 20, "total_tokens": 30}
    return_val = [mock_response]

    # Update and save
    cache1.update(prompt, llm_string, return_val)
    cache1.save()

    # Verify no lock files remain after save
    lock_files = list(Path(temp_cache_dir).rglob("*.lock"))
    assert len(lock_files) == 0, "Lock files should be cleaned up after save()"

    # Verify response file was created
    response_files = list(Path(temp_cache_dir).rglob("response.json"))
    assert len(response_files) == 1, "Response file should be created"
