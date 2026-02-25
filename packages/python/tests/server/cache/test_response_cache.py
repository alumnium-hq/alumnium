import json
from json import dumps
from pathlib import Path
from shutil import rmtree
from tempfile import mkdtemp
from unittest.mock import Mock

from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration
from pytest import fixture

from alumnium.server.cache.response_cache import ResponseCache
from alumnium.server.models import Model


@fixture
def temp_cache_dir():
    temp_dir = mkdtemp()
    yield temp_dir
    rmtree(temp_dir, ignore_errors=True)


@fixture(autouse=True)
def setup_model():
    original = Model.current
    Model.current = Mock()
    Model.current.provider = Mock()
    Model.current.provider.value = "test_provider"
    Model.current.name = "test_model"
    yield
    Model.current = original


def test_cache_save_and_lookup(temp_cache_dir):
    cache = ResponseCache(cache_dir=temp_cache_dir)

    prompt = dumps(
        [
            {"kwargs": {"type": "system", "content": "You are a helpful assistant"}},
            {"kwargs": {"type": "human", "content": "Hello, world!"}},
        ]
    )
    llm_string = "test_llm"

    mock_message = AIMessage(
        content="Hello! How can I help you?",
        usage_metadata={"input_tokens": 10, "output_tokens": 20, "total_tokens": 30},
    )
    return_val = [ChatGeneration(message=mock_message)]

    cache.update(prompt, llm_string, return_val)
    assert cache.lookup(prompt, llm_string) == return_val, "Lookup should return the cached response"

    cache.save()
    assert cache.lookup(prompt, llm_string) == return_val, "Lookup should return the cached response"

    lock_files = list(Path(temp_cache_dir).rglob("*.lock"))
    assert len(lock_files) == 0, f"Lock files should be cleaned up, but found: {lock_files}"

    response_files = list(Path(temp_cache_dir).rglob("response.json"))
    assert len(response_files) == 1, "Response file should be created"
    assert "responses" in str(response_files[0]), "Cache path should include 'responses' prefix"

    request_files = list(Path(temp_cache_dir).rglob("request.json"))
    assert len(request_files) == 1, "Request file should be created"
    with open(request_files[0]) as f:
        request_data = json.load(f)
    assert request_data["system"] == "You are a helpful assistant"
    assert request_data["human"] == "Hello, world!"


def test_cache_concurrent_saves(temp_cache_dir):
    cache1 = ResponseCache(cache_dir=temp_cache_dir)
    cache2 = ResponseCache(cache_dir=temp_cache_dir)

    prompt1 = dumps(
        [
            {"kwargs": {"type": "system", "content": "System"}},
            {"kwargs": {"type": "human", "content": "Message 1"}},
        ]
    )
    prompt2 = dumps(
        [
            {"kwargs": {"type": "system", "content": "System"}},
            {"kwargs": {"type": "human", "content": "Message 2"}},
        ]
    )

    llm_string = "test_llm"

    mock_message1 = AIMessage(
        content="Response 1",
        usage_metadata={"input_tokens": 10, "output_tokens": 20, "total_tokens": 30},
    )
    mock_response1 = ChatGeneration(message=mock_message1)

    mock_message2 = AIMessage(
        content="Response 2",
        usage_metadata={"input_tokens": 15, "output_tokens": 25, "total_tokens": 40},
    )
    mock_response2 = ChatGeneration(message=mock_message2)

    cache1.update(prompt1, llm_string, [mock_response1])
    cache2.update(prompt2, llm_string, [mock_response2])

    cache1.save()
    cache2.save()

    lock_files = list(Path(temp_cache_dir).rglob("*.lock"))
    assert len(lock_files) == 0, f"Lock files should be cleaned up after both saves, but found: {lock_files}"

    response_files = list(Path(temp_cache_dir).rglob("response.json"))
    assert len(response_files) == 2, "Response files should be created"

    request_files = list(Path(temp_cache_dir).rglob("request.json"))
    assert len(request_files) == 2, "Request files should be created"
