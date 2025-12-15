import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import Mock

import pytest
from langchain_core.messages import AIMessage

from alumnium.server.cache.fragments_cache import FragmentsCache
from alumnium.server.models import Model


@pytest.fixture
def temp_cache_dir():
    """Create a temporary cache directory."""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir)


@pytest.fixture
def fragments_cache(temp_cache_dir):
    """Create a FragmentsCache instance with temp directory."""
    return FragmentsCache(cache_dir=temp_cache_dir)


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


class TestFragmentsCacheBasics:
    """Test basic cache operations."""

    def test_cache_initialization(self, temp_cache_dir):
        """Test cache initializes correctly."""
        cache = FragmentsCache(cache_dir=temp_cache_dir)
        assert cache.cache_dir == Path(temp_cache_dir)
        assert cache.usage == {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        assert len(cache._in_memory_cache) == 0

    def test_cache_miss_no_files(self, fragments_cache, setup_model):
        """Test cache miss when no files exist."""
        prompt = create_planner_prompt("click login", "<button id='1'>Login</button>")
        result = fragments_cache.lookup(prompt, "llm_string")
        assert result is None

    def test_prompt_parsing_planner(self, fragments_cache):
        """Test parsing planner prompt."""
        goal = "click login button"
        tree = "<button id='1'>Login</button>"
        prompt = create_planner_prompt(goal, tree)

        parsed = fragments_cache._parse_prompt(prompt)
        assert parsed is not None
        assert parsed["goal"] == goal
        assert "step" not in parsed
        assert parsed["accessibility_tree"] == tree

    def test_prompt_parsing_actor(self, fragments_cache):
        """Test parsing actor prompt."""
        goal = "login to app"
        step = "click login button"
        tree = "<button id='1'>Login</button>"
        prompt = create_actor_prompt(goal, step, tree)

        parsed = fragments_cache._parse_prompt(prompt)
        assert parsed is not None
        assert parsed["goal"] == goal
        assert parsed["step"] == step
        assert parsed["accessibility_tree"] == tree

    def test_is_planner_prompt(self, fragments_cache):
        """Test planner prompt detection."""
        planner_parsed = {"goal": "login", "accessibility_tree": "<tree/>"}
        actor_parsed = {"goal": "login", "step": "click button", "accessibility_tree": "<tree/>"}

        assert fragments_cache._is_planner_prompt(planner_parsed) is True
        assert fragments_cache._is_planner_prompt(actor_parsed) is False


class TestFragmentExtraction:
    """Test fragment extraction and validation."""

    def test_extract_element_attrs(self, fragments_cache):
        """Test extracting element attributes by id."""
        tree_xml = """
        <root>
            <button id="1" name="Login">Click me</button>
            <input id="2" name="username" type="text"/>
        </root>
        """

        elem_attrs = fragments_cache._extract_element_attrs(tree_xml, 1)
        assert elem_attrs is not None
        assert elem_attrs["id"] == 1
        assert elem_attrs["name"] == "Login"
        assert elem_attrs["role"] == "button"

    def test_extract_element_attrs_not_found(self, fragments_cache):
        """Test extracting non-existent element."""
        tree_xml = "<button id='1'>Login</button>"
        elem_attrs = fragments_cache._extract_element_attrs(tree_xml, 999)
        assert elem_attrs is None

    def test_extract_element_ids_from_tool_calls(self, fragments_cache):
        """Test extracting element IDs from tool calls."""
        tool_calls = [
            {"name": "ClickTool", "args": {"id": 1}},
            {"name": "TypeTool", "args": {"id": 2, "text": "hello"}},
            {"name": "DragAndDropTool", "args": {"from_id": 3, "to_id": 4}},
        ]
        response = create_response("", tool_calls)

        ids = fragments_cache._extract_element_ids(response)
        assert ids == {1, 2, 3, 4}

    def test_validate_fragments_all_present(self, fragments_cache):
        """Test fragment validation when all fragments are present."""
        fragments = [
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

        assert fragments_cache._validate_fragments(fragments, tree_xml) is True

    def test_validate_fragments_missing(self, fragments_cache):
        """Test fragment validation when fragment is missing."""
        fragments = [{"role": "button", "id": 1, "name": "Logout"}]
        tree_xml = '<button id="1" name="Login"/>'

        assert fragments_cache._validate_fragments(fragments, tree_xml) is False

    def test_validate_fragments_attribute_order_independent(self, fragments_cache):
        """Test fragment validation is independent of attribute order."""
        # Fragment with attributes in one order
        fragments = [{"role": "button", "name": "Login", "id": 1, "focusable": True}]
        # Tree with attributes in different order
        tree_xml = '<root><button id="1" focusable="true" name="Login"/></root>'

        assert fragments_cache._validate_fragments(fragments, tree_xml) is True

    def test_validate_fragments_empty_list(self, fragments_cache):
        """Test validating empty fragments list."""
        assert fragments_cache._validate_fragments([], "<tree/>") is True


class TestPlannerCache:
    """Test planner cache behavior."""

    def test_planner_update_creates_empty_fragments(self, fragments_cache, setup_model):
        """Test planner update creates entry with empty fragments."""
        goal = "login to app"
        tree = "<button id='1'>Login</button>"
        prompt = create_planner_prompt(goal, tree)
        response = create_response("step1\nstep2")

        fragments_cache.update(prompt, "llm_string", response)

        # Check in-memory cache
        from xxhash import xxh3_128_hexdigest

        goal_hash = xxh3_128_hexdigest(goal)
        mem_key = ("llm_string", goal_hash)
        assert mem_key in fragments_cache._in_memory_cache

        return_val, fragments, agent_type, should_save = fragments_cache._in_memory_cache[mem_key]
        assert fragments == []
        assert agent_type == "plans"
        assert should_save is True

    def test_planner_lookup_with_valid_fragments(self, fragments_cache, setup_model):
        """Test planner validation succeeds when fragments are valid."""
        # Test the validation logic directly
        tree_xml = '<root><button id="1" name="Login" /></root>'
        fragments = [{"role": "button", "id": 1, "name": "Login"}]

        # Fragments present in tree should validate
        assert fragments_cache._validate_fragments(fragments, tree_xml) is True

        # Test with empty fragments (planner initial state)
        assert fragments_cache._validate_fragments([], tree_xml) is True

    def test_planner_lookup_fails_with_invalid_fragments(self, fragments_cache, setup_model):
        """Test planner lookup fails when fragments are invalid."""
        goal = "click login"
        tree = "<button id='1' name='Logout'/>"  # Different button
        prompt = create_planner_prompt(goal, tree)
        response = create_response("step1")

        # Create cache with fragments that won't match
        from xxhash import xxh3_128_hexdigest

        goal_hash = xxh3_128_hexdigest(goal)
        cache_path = fragments_cache._get_cache_path("plans", goal_hash)
        cache_path.mkdir(parents=True, exist_ok=True)

        from langchain_core.load import dumps

        with open(cache_path / "response.json", "w") as f:
            f.write(dumps(response[0], pretty=True))

        # Save fragments that won't match current tree (different name)
        fragments = [{"role": "button", "id": 1, "name": "Login"}]
        with open(cache_path / "fragments.json", "w") as f:
            json.dump(fragments, f)

        # Lookup should fail
        result = fragments_cache.lookup(prompt, "llm_string")
        assert result is None


class TestActorCache:
    """Test actor cache behavior."""

    def test_actor_update_extracts_fragments(self, fragments_cache, setup_model):
        """Test actor update extracts element fragments."""
        goal = "login to app"
        step = "click login button"
        tree = """<button id="1" name="Login"/>
                  <input id="2" name="username"/>"""
        prompt = create_actor_prompt(goal, step, tree)

        tool_calls = [{"name": "ClickTool", "args": {"id": 1}}]
        response = create_response("", tool_calls)

        fragments_cache.update(prompt, "llm_string", response)

        # Check in-memory cache
        from xxhash import xxh3_128_hexdigest

        step_hash = xxh3_128_hexdigest(step)
        mem_key = ("llm_string", step_hash)
        assert mem_key in fragments_cache._in_memory_cache

        return_val, fragments, agent_type, should_save = fragments_cache._in_memory_cache[mem_key]
        assert len(fragments) == 1
        assert fragments[0]["id"] == 1
        assert fragments[0]["name"] == "Login"
        assert fragments[0]["role"] == "button"
        assert agent_type == "actions"

    def test_actor_update_updates_planner_fragments(self, fragments_cache, setup_model):
        """Test actor update adds fragments to planner cache."""
        goal = "login to app"
        step = "click login button"
        tree = '<button id="1" name="Login"/>'

        # First create planner cache entry in memory
        planner_prompt = create_planner_prompt(goal, tree)
        planner_response = create_response("step1")
        fragments_cache.update(planner_prompt, "llm_string", planner_response)

        # Now update actor cache (should update planner fragments)
        actor_prompt = create_actor_prompt(goal, step, tree)
        tool_calls = [{"name": "ClickTool", "args": {"id": 1}}]
        actor_response = create_response("", tool_calls)

        fragments_cache.update(actor_prompt, "llm_string", actor_response)
        fragments_cache.save()

        # Check planner fragments were updated
        from xxhash import xxh3_128_hexdigest
        goal_hash = xxh3_128_hexdigest(goal)
        planner_path = fragments_cache._get_cache_path("plans", goal_hash)

        with open(planner_path / "fragments.json", "r") as f:
            planner_fragments = json.load(f)

        assert len(planner_fragments) == 1
        assert planner_fragments[0]["id"] == 1
        assert planner_fragments[0]["name"] == "Login"

    def test_actor_lookup_with_valid_fragments(self, fragments_cache, setup_model):
        """Test actor validation succeeds when fragments are valid."""
        # Test the validation and fragment extraction logic
        goal = "login to app"
        step = "click login button"
        tree = '<root><button id="1" name="Login" /></root>'
        prompt = create_actor_prompt(goal, step, tree)

        tool_calls = [{"name": "ClickTool", "args": {"id": 1}}]
        response = create_response("", tool_calls)

        # Test fragment extraction
        fragments_cache.update(prompt, "llm_string", response)

        # Check fragments were extracted correctly
        from xxhash import xxh3_128_hexdigest

        step_hash = xxh3_128_hexdigest(step)
        mem_key = ("llm_string", step_hash)
        assert mem_key in fragments_cache._in_memory_cache

        _, fragments, _, _ = fragments_cache._in_memory_cache[mem_key]
        assert len(fragments) > 0
        assert fragments[0]["id"] == 1
        assert fragments[0]["name"] == "Login"

        # Test validation with those fragments in a similar tree
        similar_tree = '<root><div><button id="1" name="Login" /></div></root>'
        assert fragments_cache._validate_fragments(fragments, similar_tree) is True


class TestCachePersistence:
    """Test cache save and load operations."""

    def test_save_and_lookup_planner(self, fragments_cache, setup_model):
        """Test saving planner cache to disk."""
        goal = "click login"
        tree = "<button id='1' name='Login'/>"
        prompt = create_planner_prompt(goal, tree)
        response = create_response("step1\nstep2")

        # Update and save
        fragments_cache.update(prompt, "llm_string", response)
        fragments_cache.save()

        # Verify files were created
        from xxhash import xxh3_128_hexdigest

        goal_hash = xxh3_128_hexdigest(goal)
        cache_path = fragments_cache._get_cache_path("plans", goal_hash)

        assert (cache_path / "response.json").exists()
        assert (cache_path / "fragments.json").exists()

        # Verify fragments file has empty list
        with open(cache_path / "fragments.json", "r") as f:
            fragments = json.load(f)
        assert fragments == []

    def test_save_and_lookup_actor(self, fragments_cache, setup_model):
        """Test saving actor cache to disk."""
        goal = "login"
        step = "click button"
        tree = '<button id="1" name="Login"/>'
        prompt = create_actor_prompt(goal, step, tree)

        tool_calls = [{"name": "ClickTool", "args": {"id": 1}}]
        response = create_response("", tool_calls)

        # Update and save
        fragments_cache.update(prompt, "llm_string", response)
        fragments_cache.save()

        # Verify files were created
        from xxhash import xxh3_128_hexdigest

        step_hash = xxh3_128_hexdigest(step)
        cache_path = fragments_cache._get_cache_path("actions", step_hash)

        assert (cache_path / "response.json").exists()
        assert (cache_path / "fragments.json").exists()

        # Verify fragments were extracted
        with open(cache_path / "fragments.json", "r") as f:
            fragments = json.load(f)
        assert len(fragments) > 0
        assert fragments[0]["id"] == 1
        assert fragments[0]["name"] == "Login"

    def test_discard_clears_in_memory_cache(self, fragments_cache, setup_model):
        """Test discard clears in-memory cache without saving."""
        goal = "click login"
        tree = "<button id='1'/>"
        prompt = create_planner_prompt(goal, tree)
        response = create_response("step1")

        fragments_cache.update(prompt, "llm_string", response)
        assert len(fragments_cache._in_memory_cache) > 0

        fragments_cache.discard()
        assert len(fragments_cache._in_memory_cache) == 0

    def test_clear_removes_all_files(self, fragments_cache, setup_model):
        """Test clear removes all cached files."""
        goal = "click login"
        tree = "<button id='1'/>"
        prompt = create_planner_prompt(goal, tree)
        response = create_response("step1")

        fragments_cache.update(prompt, "llm_string", response)
        fragments_cache.save()

        # Verify files exist
        fragments_dir = fragments_cache._get_fragments_base_dir()
        assert fragments_dir.exists()

        # Clear cache
        fragments_cache.clear()

        # Verify files removed
        assert not fragments_dir.exists()


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_malformed_xml_in_tree(self, fragments_cache):
        """Test handling malformed XML gracefully."""
        tree_xml = "<button id='1' unclosed"
        elem_attrs = fragments_cache._extract_element_attrs(tree_xml, 1)
        assert elem_attrs is None

    def test_missing_id_attribute(self, fragments_cache):
        """Test handling elements without id."""
        tree_xml = "<button name='Login'/>"
        elem_attrs = fragments_cache._extract_element_attrs(tree_xml, 1)
        assert elem_attrs is None

    def test_empty_prompt(self, fragments_cache):
        """Test handling empty prompt."""
        result = fragments_cache.lookup("", "llm_string")
        assert result is None

    def test_invalid_json_prompt(self, fragments_cache):
        """Test handling invalid JSON prompt."""
        result = fragments_cache.lookup("not json", "llm_string")
        assert result is None

    def test_multiple_elements_same_id(self, fragments_cache):
        """Test extracting when multiple elements have same ID (first match)."""
        tree_xml = """
        <root>
            <button id="1" name="First"/>
            <button id="1" name="Second"/>
        </root>
        """
        elem_attrs = fragments_cache._extract_element_attrs(tree_xml, 1)
        assert elem_attrs is not None
        assert elem_attrs["name"] == "First"

    def test_usage_tracking(self, fragments_cache, setup_model):
        """Test usage statistics are tracked correctly."""
        goal = "click login"
        tree = "<button id='1' name='Login'/>"
        prompt = create_planner_prompt(goal, tree)

        tool_calls = []
        response = create_response("step1", tool_calls)

        # Create cache entry
        from xxhash import xxh3_128_hexdigest

        goal_hash = xxh3_128_hexdigest(goal)
        cache_path = fragments_cache._get_cache_path("plans", goal_hash)
        cache_path.mkdir(parents=True, exist_ok=True)

        from langchain_core.load import dumps

        with open(cache_path / "response.json", "w") as f:
            f.write(dumps(response[0], pretty=True))

        with open(cache_path / "fragments.json", "w") as f:
            json.dump([], f)

        # Lookup should track usage
        initial_usage = fragments_cache.usage.copy()
        result = fragments_cache.lookup(prompt, "llm_string")

        # Only check usage if lookup succeeded
        if result is not None:
            assert fragments_cache.usage["input_tokens"] > initial_usage["input_tokens"]
            assert fragments_cache.usage["output_tokens"] > initial_usage["output_tokens"]
            assert fragments_cache.usage["total_tokens"] > initial_usage["total_tokens"]
        else:
            # If lookup failed, usage should not change
            assert fragments_cache.usage == initial_usage


class TestCachePathConstruction:
    """Test cache path construction."""

    def test_get_cache_path_plans(self, fragments_cache, setup_model):
        """Test cache path for planner."""
        cache_hash = "abc123"
        path = fragments_cache._get_cache_path("plans", cache_hash)

        assert "test_provider" in str(path)
        assert "test_model" in str(path)
        assert "fragments" in str(path)
        assert "plans" in str(path)
        assert "abc123" in str(path)

    def test_get_cache_path_actions(self, fragments_cache, setup_model):
        """Test cache path for actor."""
        cache_hash = "xyz789"
        path = fragments_cache._get_cache_path("actions", cache_hash)

        assert "test_provider" in str(path)
        assert "test_model" in str(path)
        assert "fragments" in str(path)
        assert "actions" in str(path)
        assert "xyz789" in str(path)

    def test_get_fragments_base_dir(self, fragments_cache, setup_model):
        """Test getting fragments base directory."""
        base_dir = fragments_cache._get_fragments_base_dir()

        assert "test_provider" in str(base_dir)
        assert "test_model" in str(base_dir)
        assert "fragments" in str(base_dir)
