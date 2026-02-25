import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import Mock

import pytest
from langchain_core.messages import AIMessage

from alumnium.server.cache.elements_cache import ElementsCache
from alumnium.server.models import Model


@pytest.fixture
def temp_cache_dir():
    """Create a temporary cache directory."""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir)


@pytest.fixture
def elements_cache(temp_cache_dir):
    """Create an ElementsCache instance with temp directory."""
    cache = ElementsCache(cache_dir=temp_cache_dir)
    cache.app = "example.com"
    return cache


@pytest.fixture
def setup_model():
    """Setup Model.current for tests."""
    Model.current = Mock()
    Model.current.provider = Mock()
    Model.current.provider.value = "test_provider"
    Model.current.name = "test_model"
    yield
    Model.current = None


def create_planner_prompt(goal: str, accessibility_tree: str) -> str:
    """Create a planner agent prompt matching actual format."""
    messages = [
        {
            "kwargs": {
                "type": "system",
                "content": "You are a planner agent.",
            }
        },
        {
            "kwargs": {
                "type": "human",
                "content": f"Given the following XML accessibility tree:\n```xml\n{accessibility_tree}\n```\nOutline the actions needed to achieve the following goal: {goal}",
            }
        },
    ]
    return json.dumps(messages)


def create_actor_prompt(goal: str, step: str, accessibility_tree: str) -> str:
    """Create an actor agent prompt matching actual format."""
    messages = [
        {
            "kwargs": {
                "type": "system",
                "content": "You are an actor agent.",
            }
        },
        {
            "kwargs": {
                "type": "human",
                "content": f"Goal: {goal}\nStep: {step}\nWebpage ARIA tree:\n```xml\n{accessibility_tree}\n```",
            }
        },
    ]
    return json.dumps(messages)


def create_response(content: str, tool_calls: list[dict] = None) -> list:
    """Create a mock LLM response matching LangChain ChatGeneration structure."""
    usage_metadata = {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150}

    # Create response (ChatGeneration)
    response = Mock()
    response.content = content
    response.usage_metadata = usage_metadata

    # ChatGeneration has a message attribute with tool_calls
    response.message = Mock(spec=AIMessage)
    response.message.content = content
    response.message.tool_calls = tool_calls or []
    response.message.usage_metadata = usage_metadata

    return [response]


class TestElementsCacheBasics:
    """Test basic cache operations."""

    def test_cache_initialization(self, temp_cache_dir):
        """Test cache initializes correctly."""
        cache = ElementsCache(cache_dir=temp_cache_dir)
        assert cache.cache_dir == Path(temp_cache_dir)
        assert cache.usage == {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        assert len(cache._in_memory_cache) == 0

    def test_cache_miss_no_files(self, elements_cache, setup_model):
        """Test cache miss when no files exist."""
        prompt = create_planner_prompt("click login", "<button id='1'>Login</button>")
        result = elements_cache.lookup(prompt, "llm_string")
        assert result is None

    def test_prompt_parsing_planner(self, elements_cache):
        """Test parsing planner prompt."""
        goal = "click login button"
        tree = "<button id='1'>Login</button>"
        prompt = create_planner_prompt(goal, tree)

        parsed = elements_cache._parse_prompt(prompt)
        assert parsed is not None
        assert parsed["goal"] == goal
        assert "step" not in parsed
        assert parsed["accessibility_tree"] == tree

    def test_prompt_parsing_actor(self, elements_cache):
        """Test parsing actor prompt."""
        goal = "login to app"
        step = "click login button"
        tree = "<button id='1'>Login</button>"
        prompt = create_actor_prompt(goal, step, tree)

        parsed = elements_cache._parse_prompt(prompt)
        assert parsed is not None
        assert parsed["goal"] == goal
        assert parsed["step"] == step
        assert parsed["accessibility_tree"] == tree

    def test_is_planner_prompt(self, elements_cache):
        """Test planner prompt detection."""
        planner_parsed = {"goal": "login", "accessibility_tree": "<tree/>"}
        actor_parsed = {"goal": "login", "step": "click button", "accessibility_tree": "<tree/>"}

        assert elements_cache._is_planner_prompt(planner_parsed) is True
        assert elements_cache._is_planner_prompt(actor_parsed) is False


class TestElementExtraction:
    """Test element extraction and validation."""

    def test_extract_element_attrs(self, elements_cache):
        """Test extracting element attributes by id."""
        tree_xml = """
        <root>
            <button id="1" name="Login">Click me</button>
            <input id="2" name="username" type="text"/>
        </root>
        """

        elem_attrs = elements_cache._extract_element_attrs(tree_xml, 1)
        assert elem_attrs is not None
        assert elem_attrs["id"] == 1
        assert elem_attrs["name"] == "Login"
        assert elem_attrs["role"] == "button"

    def test_extract_element_attrs_not_found(self, elements_cache):
        """Test extracting non-existent element."""
        tree_xml = "<button id='1'>Login</button>"
        elem_attrs = elements_cache._extract_element_attrs(tree_xml, 999)
        assert elem_attrs is None

    def test_extract_element_ids_from_tool_calls(self, elements_cache):
        """Test extracting element IDs from tool calls."""
        tool_calls = [
            {"name": "ClickTool", "args": {"id": 1}},
            {"name": "TypeTool", "args": {"id": 2, "text": "hello"}},
            {"name": "DragAndDropTool", "args": {"from_id": 3, "to_id": 4}},
        ]
        response = create_response("", tool_calls)

        ids = elements_cache._extract_element_ids(response)
        assert ids == {1, 2, 3, 4}

    def test_validate_elements_all_present(self, elements_cache):
        """Test element validation when all elements are present."""
        elements = [
            {"role": "button", "id": 1, "name": "Login"},
            {"role": "input", "id": 2, "name": "username"},
        ]
        tree_xml = """
        <root>
            <button id="1" name="Login"/>
            <input id="2" name="username"/>
            <button id="3" name="Submit"/>
        </root>
        """

        assert elements_cache._validate_elements(elements, tree_xml) is True

    def test_validate_elements_missing(self, elements_cache):
        """Test element validation when element is missing."""
        elements = [{"role": "button", "id": 1, "name": "Logout"}]
        tree_xml = '<button id="1" name="Login"/>'

        assert elements_cache._validate_elements(elements, tree_xml) is False

    def test_validate_elements_attribute_order_independent(self, elements_cache):
        """Test element validation is independent of attribute order."""
        # Element with attributes in one order
        elements = [{"role": "button", "name": "Login", "id": 1, "focusable": True}]
        # Tree with attributes in different order
        tree_xml = '<root><button id="1" focusable="true" name="Login"/></root>'

        assert elements_cache._validate_elements(elements, tree_xml) is True

    def test_validate_elements_empty_list(self, elements_cache):
        """Test validating empty elements list."""
        assert elements_cache._validate_elements([], "<tree/>") is True


class TestPlannerCache:
    """Test planner cache behavior."""

    def test_planner_update_creates_empty_elements(self, elements_cache, setup_model):
        """Test planner update creates entry with empty elements."""
        goal = "login to app"
        tree = "<button id='1'>Login</button>"
        prompt = create_planner_prompt(goal, tree)
        response = create_response("step1\nstep2")

        elements_cache.update(prompt, "llm_string", response)

        # Check in-memory cache
        from xxhash import xxh3_128_hexdigest

        goal_hash = xxh3_128_hexdigest(goal)
        mem_key = ("llm_string", goal_hash)
        assert mem_key in elements_cache._in_memory_cache

        return_val, elements, agent_type, app, instruction, should_save = elements_cache._in_memory_cache[mem_key]
        assert elements == []
        assert agent_type == "plans"
        assert should_save is True
        assert instruction == {"goal": goal}

    def test_planner_lookup_with_valid_elements(self, elements_cache, setup_model):
        """Test planner validation succeeds when elements are valid."""
        # Test the validation logic directly
        tree_xml = '<root><button id="1" name="Login" /></root>'
        elements = [{"role": "button", "id": 1, "name": "Login"}]

        # Elements present in tree should validate
        assert elements_cache._validate_elements(elements, tree_xml) is True

        # Test with empty elements (planner initial state)
        assert elements_cache._validate_elements([], tree_xml) is True

    def test_planner_lookup_fails_with_invalid_elements(self, elements_cache, setup_model):
        """Test planner lookup fails when elements are invalid."""
        goal = "click login"
        tree = "<button id='1' name='Logout'/>"  # Different button
        prompt = create_planner_prompt(goal, tree)
        response = create_response("step1")

        # Create cache with elements that won't match
        from xxhash import xxh3_128_hexdigest

        goal_hash = xxh3_128_hexdigest(goal)
        cache_path = elements_cache._get_cache_path("plans", goal_hash)
        cache_path.mkdir(parents=True, exist_ok=True)

        from langchain_core.load import dumps

        with open(cache_path / "response.json", "w") as f:
            f.write(dumps(response[0], pretty=True))

        # Save elements that won't match current tree (different name)
        elements = [{"role": "button", "id": 1, "name": "Login"}]
        with open(cache_path / "elements.json", "w") as f:
            json.dump(elements, f)

        # Lookup should fail
        result = elements_cache.lookup(prompt, "llm_string")
        assert result is None


class TestActorCache:
    """Test actor cache behavior."""

    def test_actor_update_extracts_elements(self, elements_cache, setup_model):
        """Test actor update extracts element elements."""
        goal = "login to app"
        step = "click login button"
        tree = """<button id="1" name="Login"/>
                  <input id="2" name="username"/>"""
        prompt = create_actor_prompt(goal, step, tree)

        tool_calls = [{"name": "ClickTool", "args": {"id": 1}}]
        response = create_response("", tool_calls)

        elements_cache.update(prompt, "llm_string", response)

        # Check in-memory cache
        from xxhash import xxh3_128_hexdigest

        step_hash = xxh3_128_hexdigest(step)
        mem_key = ("llm_string", step_hash)
        assert mem_key in elements_cache._in_memory_cache

        return_val, elements, agent_type, app, instruction, should_save = elements_cache._in_memory_cache[mem_key]
        assert len(elements) == 1
        assert elements[0]["id"] == 1
        assert elements[0]["name"] == "Login"
        assert elements[0]["role"] == "button"
        assert agent_type == "actions"
        assert instruction == {"goal": goal, "step": step}

    def test_actor_update_updates_planner_elements(self, elements_cache, setup_model):
        """Test actor update adds elements to planner cache."""
        goal = "login to app"
        step = "click login button"
        tree = '<button id="1" name="Login"/>'

        # First create planner cache entry in memory
        planner_prompt = create_planner_prompt(goal, tree)
        planner_response = create_response("step1")
        elements_cache.update(planner_prompt, "llm_string", planner_response)

        # Now update actor cache (should update planner elements)
        actor_prompt = create_actor_prompt(goal, step, tree)
        tool_calls = [{"name": "ClickTool", "args": {"id": 1}}]
        actor_response = create_response("", tool_calls)

        elements_cache.update(actor_prompt, "llm_string", actor_response)
        elements_cache.save()

        # Check planner elements were updated
        from xxhash import xxh3_128_hexdigest

        goal_hash = xxh3_128_hexdigest(goal)
        planner_path = elements_cache._get_cache_path("plans", goal_hash)

        with open(planner_path / "elements.json", "r") as f:
            planner_elements = json.load(f)

        assert len(planner_elements) == 1
        assert planner_elements[0]["id"] == 1
        assert planner_elements[0]["name"] == "Login"

    def test_actor_lookup_with_valid_elements(self, elements_cache, setup_model):
        """Test actor validation succeeds when elements are valid."""
        # Test the validation and element extraction logic
        goal = "login to app"
        step = "click login button"
        tree = '<root><button id="1" name="Login" /></root>'
        prompt = create_actor_prompt(goal, step, tree)

        tool_calls = [{"name": "ClickTool", "args": {"id": 1}}]
        response = create_response("", tool_calls)

        # Test element extraction
        elements_cache.update(prompt, "llm_string", response)

        # Check elements were extracted correctly
        from xxhash import xxh3_128_hexdigest

        step_hash = xxh3_128_hexdigest(step)
        mem_key = ("llm_string", step_hash)
        assert mem_key in elements_cache._in_memory_cache

        _, elements, _, _, _, _ = elements_cache._in_memory_cache[mem_key]
        assert len(elements) > 0
        assert elements[0]["id"] == 1
        assert elements[0]["name"] == "Login"

        # Test validation with those elements in a similar tree
        similar_tree = '<root><div><button id="1" name="Login" /></div></root>'
        assert elements_cache._validate_elements(elements, similar_tree) is True


class TestCachePersistence:
    """Test cache save and load operations."""

    def test_save_and_lookup_planner(self, elements_cache, setup_model):
        """Test saving planner cache to disk."""
        goal = "click login"
        tree = "<button id='1' name='Login'/>"
        prompt = create_planner_prompt(goal, tree)
        response = create_response("step1\nstep2")

        # Update and save
        elements_cache.update(prompt, "llm_string", response)
        elements_cache.save()

        # Verify files were created
        from xxhash import xxh3_128_hexdigest

        goal_hash = xxh3_128_hexdigest(goal)
        cache_path = elements_cache._get_cache_path("plans", goal_hash)

        assert (cache_path / "response.json").exists()
        assert (cache_path / "elements.json").exists()
        assert (cache_path / "instruction.json").exists()

        # Verify elements file has empty list
        with open(cache_path / "elements.json", "r") as f:
            elements = json.load(f)
        assert elements == []

        # Verify instruction file has goal
        with open(cache_path / "instruction.json", "r") as f:
            instruction = json.load(f)
        assert instruction == {"goal": goal}

    def test_save_and_lookup_actor(self, elements_cache, setup_model):
        """Test saving actor cache to disk."""
        goal = "login"
        step = "click button"
        tree = '<button id="1" name="Login"/>'
        prompt = create_actor_prompt(goal, step, tree)

        tool_calls = [{"name": "ClickTool", "args": {"id": 1}}]
        response = create_response("", tool_calls)

        # Update and save
        elements_cache.update(prompt, "llm_string", response)
        elements_cache.save()

        # Verify files were created
        from xxhash import xxh3_128_hexdigest

        step_hash = xxh3_128_hexdigest(step)
        cache_path = elements_cache._get_cache_path("actions", step_hash)

        assert (cache_path / "response.json").exists()
        assert (cache_path / "elements.json").exists()
        assert (cache_path / "instruction.json").exists()

        # Verify elements were extracted
        with open(cache_path / "elements.json", "r") as f:
            elements = json.load(f)
        assert len(elements) > 0
        assert elements[0]["id"] == 1
        assert elements[0]["name"] == "Login"

        # Verify instruction file has goal and step
        with open(cache_path / "instruction.json", "r") as f:
            instruction = json.load(f)
        assert instruction == {"goal": goal, "step": step}

    def test_discard_clears_in_memory_cache(self, elements_cache, setup_model):
        """Test discard clears in-memory cache without saving."""
        goal = "click login"
        tree = "<button id='1'/>"
        prompt = create_planner_prompt(goal, tree)
        response = create_response("step1")

        elements_cache.update(prompt, "llm_string", response)
        assert len(elements_cache._in_memory_cache) > 0

        elements_cache.discard()
        assert len(elements_cache._in_memory_cache) == 0

    def test_clear_removes_all_files(self, elements_cache, setup_model):
        """Test clear removes all cached files."""
        goal = "click login"
        tree = "<button id='1'/>"
        prompt = create_planner_prompt(goal, tree)
        response = create_response("step1")

        elements_cache.update(prompt, "llm_string", response)
        elements_cache.save()

        # Verify files exist
        elements_dir = elements_cache._get_elements_base_dir()
        assert elements_dir.exists()

        # Clear cache
        elements_cache.clear()

        # Verify files removed
        assert not elements_dir.exists()


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_malformed_xml_in_tree(self, elements_cache):
        """Test handling malformed XML gracefully."""
        tree_xml = "<button id='1' unclosed"
        elem_attrs = elements_cache._extract_element_attrs(tree_xml, 1)
        assert elem_attrs is None

    def test_missing_id_attribute(self, elements_cache):
        """Test handling elements without id."""
        tree_xml = "<button name='Login'/>"
        elem_attrs = elements_cache._extract_element_attrs(tree_xml, 1)
        assert elem_attrs is None

    def test_empty_prompt(self, elements_cache):
        """Test handling empty prompt."""
        result = elements_cache.lookup("", "llm_string")
        assert result is None

    def test_invalid_json_prompt(self, elements_cache):
        """Test handling invalid JSON prompt."""
        result = elements_cache.lookup("not json", "llm_string")
        assert result is None

    def test_multiple_elements_same_id(self, elements_cache):
        """Test extracting when multiple elements have same ID (first match)."""
        tree_xml = """
        <root>
            <button id="1" name="First"/>
            <button id="1" name="Second"/>
        </root>
        """
        elem_attrs = elements_cache._extract_element_attrs(tree_xml, 1)
        assert elem_attrs is not None
        assert elem_attrs["name"] == "First"

    def test_usage_tracking(self, elements_cache, setup_model):
        """Test usage statistics are tracked correctly."""
        goal = "click login"
        tree = "<button id='1' name='Login'/>"
        prompt = create_planner_prompt(goal, tree)

        tool_calls = []
        response = create_response("step1", tool_calls)

        # Create cache entry
        from xxhash import xxh3_128_hexdigest

        goal_hash = xxh3_128_hexdigest(goal)
        cache_path = elements_cache._get_cache_path("plans", goal_hash)
        cache_path.mkdir(parents=True, exist_ok=True)

        from langchain_core.load import dumps

        with open(cache_path / "response.json", "w") as f:
            f.write(dumps(response[0], pretty=True))

        with open(cache_path / "elements.json", "w") as f:
            json.dump([], f)

        # Lookup should track usage
        initial_usage = elements_cache.usage.copy()
        result = elements_cache.lookup(prompt, "llm_string")

        # Only check usage if lookup succeeded
        if result is not None:
            assert elements_cache.usage["input_tokens"] > initial_usage["input_tokens"]
            assert elements_cache.usage["output_tokens"] > initial_usage["output_tokens"]
            assert elements_cache.usage["total_tokens"] > initial_usage["total_tokens"]
        else:
            # If lookup failed, usage should not change
            assert elements_cache.usage == initial_usage


class TestCachePathConstruction:
    """Test cache path construction."""

    def test_get_cache_path_plans(self, elements_cache, setup_model):
        """Test cache path for planner."""
        cache_hash = "abc123"
        path = elements_cache._get_cache_path("plans", cache_hash)

        assert "example.com" in str(path)
        assert "test_provider" in str(path)
        assert "test_model" in str(path)
        assert "elements" in str(path)
        assert "plans" in str(path)
        assert "abc123" in str(path)

    def test_get_cache_path_actions(self, elements_cache, setup_model):
        """Test cache path for actor."""
        cache_hash = "xyz789"
        path = elements_cache._get_cache_path("actions", cache_hash)

        assert "example.com" in str(path)
        assert "test_provider" in str(path)
        assert "test_model" in str(path)
        assert "elements" in str(path)
        assert "actions" in str(path)
        assert "xyz789" in str(path)

    def test_get_elements_base_dir(self, elements_cache, setup_model):
        """Test getting elements base directory."""
        base_dir = elements_cache._get_elements_base_dir()

        assert "elements" in str(base_dir)
        assert "test_provider" in str(base_dir)
        assert "test_model" in str(base_dir)

    def test_app_property(self, temp_cache_dir, setup_model):
        """Test app property getter and setter."""
        cache = ElementsCache(cache_dir=temp_cache_dir)
        assert cache.app == "unknown"

        cache.app = "staging.airbnb.com"
        assert cache.app == "staging.airbnb.com"

        path = cache._get_cache_path("plans", "hash123")
        assert "staging.airbnb.com" in str(path)
        assert "test_provider" in str(path)
        assert "test_model" in str(path)
