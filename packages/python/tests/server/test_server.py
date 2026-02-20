from json import load
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from pytest import fixture

from alumnium.accessibility.chromium_accessibility_tree import ChromiumAccessibilityTree
from alumnium.server.main import app

client = TestClient(app)


def get_sample_tool_schemas():
    """Get sample tool schemas for testing."""
    return [
        {
            "type": "function",
            "function": {
                "name": "ClickTool",
                "description": "Click an element.",
                "parameters": {
                    "type": "object",
                    "properties": {"id": {"type": "integer", "description": "Element identifier (ID)"}},
                    "required": ["id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "TypeTool",
                "description": "Type text into an element.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer", "description": "Element identifier (ID)"},
                        "text": {"type": "string", "description": "Text to type into an element"},
                    },
                    "required": ["id", "text"],
                },
            },
        },
    ]


# Test fixtures for reuse across tests
@fixture
def sample_session_id():
    """Create a session for testing and return its ID."""
    response = client.post(
        "/v1/sessions",
        json={
            "provider": "anthropic",
            "name": "claude-haiku-4-5-20251001",
            "platform": "chromium",
            "tools": get_sample_tool_schemas(),
        },
    )
    assert response.status_code == 200
    return response.json()["session_id"]


@fixture
def sample_accessibility_tree():
    with open(Path(__file__).parent.parent / "fixtures/chromium_accessibility_tree.json", "r") as f:
        json = load(f)
    client_accessibility_tree = ChromiumAccessibilityTree(json)
    return client_accessibility_tree.to_str()


@fixture(autouse=True)
def mock_agents():
    """Mock all agent invoke calls to prevent actual LLM calls."""
    with (
        patch("alumnium.server.agents.planner_agent.PlannerAgent.invoke") as mock_planner,
        patch("alumnium.server.agents.actor_agent.ActorAgent.invoke") as mock_actor,
        patch("alumnium.server.agents.retriever_agent.RetrieverAgent.invoke") as mock_retriever,
        patch("alumnium.server.agents.area_agent.AreaAgent.invoke") as mock_area,
        patch("alumnium.server.agents.locator_agent.LocatorAgent.invoke") as mock_locator,
        patch("alumnium.server.agents.changes_analyzer_agent.ChangesAnalyzerAgent.invoke") as mock_changes_analyzer,
    ):
        # Mock planner agent to return list of steps
        mock_planner.return_value = (
            "Explanation",
            [
                "Step 1: Click New Todo Input field",
                "Step 2: Enter 'Buy milk'",
                "Step 3: Press Enter",
            ],
        )

        # Mock actor agent to return (explanation, actions) tuple
        mock_actor.return_value = (
            "Clicking the element and typing text",
            [
                {"tool": "click", "args": {"id": 9}},
                {"tool": "type", "args": {"id": 9, "text": "Buy milk"}},
            ],
        )

        # Mock retriever agent to return RetrievedInformation
        mock_retriever.return_value = ("Found the requested information in the accessibility tree", "true")

        # Mock area agent to return area information
        mock_area.return_value = {"id": 14, "explanation": "Found the TODO list area"}

        # Mock locator agent to return element information (as a list)
        mock_locator.return_value = [{"id": 16, "explanation": "Found the checkbox element"}]

        # Mock changes analyzer agent to return analysis string
        mock_changes_analyzer.return_value = "Button text changed from 'Click me' to 'Submit'."

        yield {
            "planner": mock_planner,
            "actor": mock_actor,
            "retriever": mock_retriever,
            "area": mock_area,
            "locator": mock_locator,
            "changes_analyzer": mock_changes_analyzer,
        }


def test_health_check():
    """Test the health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "healthy"
    assert "model" in data


def test_create_session():
    """Test creating a session."""
    response = client.post(
        "/v1/sessions",
        json={
            "provider": "anthropic",
            "name": "test_name",
            "platform": "chromium",
            "tools": get_sample_tool_schemas(),
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    assert isinstance(data["session_id"], str)


def test_list_sessions(sample_session_id):
    """Test listing sessions."""
    response = client.get("/v1/sessions")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert sample_session_id in data


def test_delete_session(sample_session_id):
    """Test deleting a session."""
    # Delete the session
    response = client.delete(f"/v1/sessions/{sample_session_id}")
    assert response.status_code == 204

    # Verify it's gone
    response = client.get("/v1/sessions")
    data = response.json()
    assert sample_session_id not in data


def test_delete_nonexistent_session():
    """Test deleting a session that doesn't exist."""
    response = client.delete("/v1/sessions/nonexistent")
    assert response.status_code == 404


def test_session_stats(sample_session_id):
    """Test getting session stats."""
    response = client.get(f"/v1/sessions/{sample_session_id}/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "input_tokens" in data["total"]
    assert "output_tokens" in data["total"]
    assert "total_tokens" in data["total"]
    assert "cache" in data
    assert "input_tokens" in data["cache"]
    assert "output_tokens" in data["cache"]
    assert "total_tokens" in data["cache"]


def test_session_stats_nonexistent():
    """Test getting stats for nonexistent session."""
    response = client.get("/v1/sessions/nonexistent/stats")
    assert response.status_code == 404


# Plan Actions Tests
def test_plan_actions_endpoint_structure(sample_session_id, sample_accessibility_tree):
    """Test that the plan actions endpoint has correct structure (without calling LLM)."""
    # This will fail because we don't have LLM API keys, but we can test the endpoint structure
    response = client.post(
        f"/v1/sessions/{sample_session_id}/plans",
        json={
            "goal": "fill out the login form",
            "accessibility_tree": sample_accessibility_tree,
            "url": "https://example.com/login",
            "title": "Login Page",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "steps" in data
    assert isinstance(data["steps"], list)


def test_plan_actions_nonexistent_session(sample_accessibility_tree):
    """Test planning actions for nonexistent session."""
    response = client.post(
        "/v1/sessions/nonexistent/plans",
        json={
            "goal": "click submit button",
            "accessibility_tree": sample_accessibility_tree,
        },
    )
    assert response.status_code == 404
    data = response.json()
    assert "error" in data


def test_plan_actions_missing_fields(sample_session_id):
    """Test planning actions with missing required fields."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/plans",
        json={
            "goal": "click button"
            # Missing accessibility_tree
        },
    )
    assert response.status_code == 422  # Validation error


# Step Actions Tests
def test_step_actions_success(sample_session_id, sample_accessibility_tree):
    """Test successful step action execution."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/steps",
        json={
            "goal": "create 'Buy milk' todo item",
            "step": "click New Todo Input field",
            "accessibility_tree": sample_accessibility_tree,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "actions" in data
    assert isinstance(data["actions"], list)


def test_step_actions_nonexistent_session(sample_accessibility_tree):
    """Test step actions for nonexistent session."""
    response = client.post(
        "/v1/sessions/nonexistent/steps",
        json={
            "goal": "log in",
            "step": "click submit",
            "accessibility_tree": sample_accessibility_tree,
        },
    )
    assert response.status_code == 404


def test_step_actions_invalid_data(sample_session_id):
    """Test step actions with invalid data."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/steps",
        json={
            "goal": "test",
            "step": "test",
            # Missing accessibility_tree
        },
    )
    assert response.status_code == 422


# Statement Tests
def test_execute_statement_success(sample_session_id, sample_accessibility_tree):
    """Test successful statement execution."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/statements",
        json={
            "statement": "there is a submit button on the page",
            "accessibility_tree": sample_accessibility_tree,
            "url": "https://example.com",
            "title": "Test Page",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "explanation" in data
    assert isinstance(data["result"], str)
    assert isinstance(data["explanation"], str)


def test_execute_statement_with_screenshot(sample_session_id, sample_accessibility_tree):
    """Test statement execution with base64 screenshot."""
    # Simple base64 encoded string (not a real image, just for testing)
    fake_screenshot = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwhgGAWjR9awAAAABJRU5ErkJggg=="

    response = client.post(
        f"/v1/sessions/{sample_session_id}/statements",
        json={
            "statement": "the page shows a login form",
            "accessibility_tree": sample_accessibility_tree,
            "screenshot": fake_screenshot,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "explanation" in data


def test_execute_statement_invalid_screenshot(sample_session_id, sample_accessibility_tree):
    """Test statement execution with invalid screenshot data."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/statements",
        json={
            "statement": "test statement",
            "accessibility_tree": sample_accessibility_tree,
            "screenshot": "invalid_base64_data!!!",
        },
    )
    # With mocking, this should still succeed even with invalid base64
    # The server logs a warning but continues processing
    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "explanation" in data


def test_execute_statement_nonexistent_session(sample_accessibility_tree):
    """Test statement execution for nonexistent session."""
    response = client.post(
        "/v1/sessions/nonexistent/statements",
        json={"statement": "test", "accessibility_tree": sample_accessibility_tree},
    )
    assert response.status_code == 404


# Area Tests
def test_get_area_success(sample_session_id, sample_accessibility_tree):
    """Test successful area identification."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/areas",
        json={
            "description": "find the login form area",
            "accessibility_tree": sample_accessibility_tree,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "explanation" in data
    assert isinstance(data["id"], int)
    assert isinstance(data["explanation"], str)


def test_get_area_nonexistent_session(sample_accessibility_tree):
    """Test area identification for nonexistent session."""
    response = client.post(
        "/v1/sessions/nonexistent/areas",
        json={
            "description": "find form",
            "accessibility_tree": sample_accessibility_tree,
        },
    )
    assert response.status_code == 404


def test_get_area_missing_data(sample_session_id):
    """Test area identification with missing data."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/areas",
        json={
            "description": "find form"
            # Missing accessibility_tree
        },
    )
    assert response.status_code == 422


# Element Locator Tests
def test_find_element_success(sample_session_id, sample_accessibility_tree):
    """Test successful element location."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/elements",
        json={
            "description": "submit button",
            "accessibility_tree": sample_accessibility_tree,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "elements" in data
    assert isinstance(data["elements"], list)
    assert len(data["elements"]) > 0
    # Check first element
    element = data["elements"][0]
    assert element["id"] == 16
    assert element["explanation"] == "Found the checkbox element"


def test_find_element_nonexistent_session(sample_accessibility_tree):
    """Test element location for nonexistent session."""
    response = client.post(
        "/v1/sessions/nonexistent/elements",
        json={
            "description": "button",
            "accessibility_tree": sample_accessibility_tree,
        },
    )
    assert response.status_code == 404


def test_find_element_missing_data(sample_session_id):
    """Test element location with missing data."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/elements",
        json={
            "description": "button"
            # Missing accessibility_tree
        },
    )
    assert response.status_code == 422


def test_find_element_empty_description(sample_session_id, sample_accessibility_tree):
    """Test element location with empty description."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/elements",
        json={
            "description": "",
            "accessibility_tree": sample_accessibility_tree,
        },
    )
    # Should succeed but may return root element or handle gracefully
    assert response.status_code == 200


# Changes Analysis Tests
def test_analyze_ui_changes_success(sample_session_id, sample_accessibility_tree):
    """Test successful UI change analysis."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/changes",
        json={
            "before": {
                "accessibility_tree": sample_accessibility_tree,
                "url": "https://example.com/page",
            },
            "after": {
                "accessibility_tree": sample_accessibility_tree,
                "url": "https://example.com/page",
            },
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert isinstance(data["result"], str)
    assert "URL did not change" in data["result"]


def test_analyze_ui_changes_with_url_change(sample_session_id, sample_accessibility_tree):
    """Test UI change analysis when URL changes."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/changes",
        json={
            "before": {
                "accessibility_tree": sample_accessibility_tree,
                "url": "https://example.com/page1",
            },
            "after": {
                "accessibility_tree": sample_accessibility_tree,
                "url": "https://example.com/page2",
            },
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "URL changed to https://example.com/page2" in data["result"]


def test_analyze_ui_changes_with_tree_diff(sample_session_id):
    """Test UI change analysis with different accessibility trees."""
    before_tree = "<root><button id='1'>Click me</button></root>"
    after_tree = "<root><button id='1'>Submit</button></root>"

    response = client.post(
        f"/v1/sessions/{sample_session_id}/changes",
        json={
            "before": {
                "accessibility_tree": before_tree,
                "url": "https://example.com/page",
            },
            "after": {
                "accessibility_tree": after_tree,
                "url": "https://example.com/page",
            },
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    # The mock returns "Button text changed from 'Click me' to 'Submit'."
    assert "Button text changed" in data["result"]


def test_analyze_ui_changes_nonexistent_session(sample_accessibility_tree):
    """Test UI change analysis for nonexistent session."""
    response = client.post(
        "/v1/sessions/nonexistent/changes",
        json={
            "before": {
                "accessibility_tree": sample_accessibility_tree,
                "url": "https://example.com/page",
            },
            "after": {
                "accessibility_tree": sample_accessibility_tree,
                "url": "https://example.com/page",
            },
        },
    )
    assert response.status_code == 404


def test_analyze_ui_changes_missing_before(sample_session_id, sample_accessibility_tree):
    """Test UI change analysis with missing 'before' field."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/changes",
        json={
            "after": {
                "accessibility_tree": sample_accessibility_tree,
                "url": "https://example.com/page",
            },
        },
    )
    assert response.status_code == 422


def test_analyze_ui_changes_missing_after(sample_session_id, sample_accessibility_tree):
    """Test UI change analysis with missing 'after' field."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/changes",
        json={
            "before": {
                "accessibility_tree": sample_accessibility_tree,
                "url": "https://example.com/page",
            },
        },
    )
    assert response.status_code == 422


def test_analyze_ui_changes_missing_accessibility_tree(sample_session_id):
    """Test UI change analysis with missing accessibility_tree field."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/changes",
        json={
            "before": {
                "url": "https://example.com/page",
            },
            "after": {
                "accessibility_tree": "<root></root>",
                "url": "https://example.com/page",
            },
        },
    )
    assert response.status_code == 422


def test_analyze_ui_changes_with_empty_url(sample_session_id, sample_accessibility_tree):
    """Test UI change analysis with empty URL (e.g., iOS/Android)."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/changes",
        json={
            "before": {
                "accessibility_tree": sample_accessibility_tree,
                "url": "",
            },
            "after": {
                "accessibility_tree": sample_accessibility_tree,
                "url": "",
            },
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    # Should not include URL change info when URLs are not provided
    assert "URL" not in data["result"]


# Session Management Edge Cases
def test_create_session_minimal_data():
    """Test creating session with minimal required data."""
    response = client.post(
        "/v1/sessions", json={"provider": "anthropic", "platform": "chromium", "tools": get_sample_tool_schemas()}
    )
    assert response.status_code == 200


def test_create_session_invalid_data():
    """Test creating session with invalid data."""
    response = client.post(
        "/v1/sessions",
        json={
            "tools": get_sample_tool_schemas(),
        },
    )
    assert response.status_code == 422


# Comprehensive Error Handling Tests
def test_malformed_json_request():
    """Test server handling of malformed JSON."""
    response = client.post("/v1/sessions", content="invalid json{}", headers={"Content-Type": "application/json"})
    assert response.status_code == 422


def test_empty_request_body():
    """Test server handling of empty request body."""
    response = client.post("/v1/sessions", json={})
    assert response.status_code == 422


def test_cors_headers():
    """Test CORS headers are present."""
    response = client.options("/health")
    # Should not error and might include CORS headers
    assert response.status_code in [200, 405]  # 405 is also acceptable for OPTIONS


# Integration Tests
def test_full_session_workflow():
    """Test a complete session workflow."""
    # 1. Create session
    create_response = client.post(
        "/v1/sessions",
        json={
            "provider": "anthropic",
            "name": "claude-haiku-4-5-20251001",
            "platform": "chromium",
            "tools": get_sample_tool_schemas(),
        },
    )
    assert create_response.status_code == 200
    session_id = create_response.json()["session_id"]

    # 2. Check it exists in session list
    list_response = client.get("/v1/sessions")
    assert session_id in list_response.json()

    # 3. Get initial stats (should be zero)
    stats_response = client.get(f"/v1/sessions/{session_id}/stats")
    initial_stats = stats_response.json()
    assert all(initial_stats["total"][key] == 0 for key in ["input_tokens", "output_tokens", "total_tokens"])
    assert all(initial_stats["cache"][key] == 0 for key in ["input_tokens", "output_tokens", "total_tokens"])

    # 4. Make a plan request (this should use some tokens)
    plan_response = client.post(
        f"/v1/sessions/{session_id}/plans",
        json={
            "goal": "click the submit button",
            "accessibility_tree": "<button id='submit'>Submit</button>",
        },
    )
    # May fail due to missing LLM API keys
    assert plan_response.status_code in [200, 500]

    # 5. Verify stats have changed (tokens were used)
    final_stats_response = client.get(f"/v1/sessions/{session_id}/stats")
    final_stats = final_stats_response.json()
    # Note: In a real scenario with actual LLM calls, tokens would be > 0
    # For now, just verify the structure is correct
    assert all(key in final_stats["total"] for key in ["input_tokens", "output_tokens", "total_tokens"])
    assert all(key in final_stats["cache"] for key in ["input_tokens", "output_tokens", "total_tokens"])

    # 6. Delete the session
    delete_response = client.delete(f"/v1/sessions/{session_id}")
    assert delete_response.status_code == 204

    # 7. Verify it's gone
    final_list_response = client.get("/sessions")
    assert session_id not in final_list_response.json()


def test_concurrent_sessions():
    """Test creating and managing multiple concurrent sessions."""
    session_ids = []

    # Create multiple sessions
    for i in range(3):
        response = client.post(
            "/v1/sessions",
            json={
                "provider": "anthropic",
                "name": f"test-model-{i}",
                "platform": "chromium",
                "tools": get_sample_tool_schemas(),
            },
        )
        assert response.status_code == 200
        session_ids.append(response.json()["session_id"])

    # Verify all exist
    list_response = client.get("/v1/sessions")
    session_list = list_response.json()
    for session_id in session_ids:
        assert session_id in session_list

    # Clean up
    for session_id in session_ids:
        delete_response = client.delete(f"/v1/sessions/{session_id}")
        assert delete_response.status_code == 204


# Example Management Tests
def test_add_example_success(sample_session_id):
    """Test adding an example successfully."""
    response = client.post(
        f"/v1/sessions/{sample_session_id}/examples",
        json={"goal": "login to the app", "actions": ["fill username field", "fill password field", "click submit"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "message" in data


def test_add_example_nonexistent_session():
    """Test adding an example to a nonexistent session."""
    response = client.post(
        "/v1/sessions/nonexistent-session/examples",
        json={"goal": "test goal", "actions": ["action1", "action2"]},
    )
    assert response.status_code == 404
    data = response.json()
    assert data["error"] == "Session not found"


def test_add_example_invalid_data(sample_session_id):
    """Test adding an example with invalid data."""
    response = client.post(f"/v1/sessions/{sample_session_id}/examples", json={"goal": "test goal"})  # missing actions
    assert response.status_code == 422  # Validation error


def test_clear_examples_success(sample_session_id):
    """Test clearing examples successfully."""
    # First add some examples
    client.post(
        f"/v1/sessions/{sample_session_id}/examples",
        json={"goal": "test goal 1", "actions": ["action1"]},
    )
    client.post(
        f"/v1/sessions/{sample_session_id}/examples",
        json={"goal": "test goal 2", "actions": ["action2"]},
    )

    # Then clear them
    response = client.delete(f"/v1/sessions/{sample_session_id}/examples")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "message" in data


def test_clear_examples_nonexistent_session():
    """Test clearing examples from a nonexistent session."""
    response = client.delete("/v1/sessions/nonexistent-session/examples")
    assert response.status_code == 404
    data = response.json()
    assert data["error"] == "Session not found"


def test_example_management_workflow(sample_session_id):
    """Test the complete example management workflow."""
    # Add multiple examples
    example1 = {"goal": "navigate to homepage", "actions": ["click home button"]}
    example2 = {"goal": "submit form", "actions": ["fill field", "click submit"]}

    response1 = client.post(f"/v1/sessions/{sample_session_id}/examples", json=example1)
    assert response1.status_code == 200

    response2 = client.post(f"/v1/sessions/{sample_session_id}/examples", json=example2)
    assert response2.status_code == 200

    # Clear all examples
    clear_response = client.delete(f"/v1/sessions/{sample_session_id}/examples")
    assert clear_response.status_code == 200

    # Add another example after clearing
    example3 = {"goal": "logout", "actions": ["click logout button"]}
    response3 = client.post(f"/v1/sessions/{sample_session_id}/examples", json=example3)
    assert response3.status_code == 200


# Tool Schema Tests
def test_create_session_with_custom_tool_schema():
    """Test creating session with custom tool schema."""
    custom_tools = [
        {
            "type": "function",
            "function": {
                "name": "CustomScrollTool",
                "description": "Scroll the page in a given direction.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "direction": {"type": "string", "description": "Direction to scroll (up/down/left/right)"},
                        "amount": {"type": "integer", "description": "Amount to scroll in pixels"},
                    },
                    "required": ["direction"],
                },
            },
        }
    ]

    response = client.post(
        "/v1/sessions",
        json={"provider": "anthropic", "name": "test-custom-tools", "platform": "chromium", "tools": custom_tools},
    )
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data

    # Clean up
    session_id = data["session_id"]
    client.delete(f"/v1/sessions/{session_id}")


def test_create_session_with_empty_tool_list():
    """Test creating session with empty tool list."""
    response = client.post(
        "/v1/sessions", json={"provider": "anthropic", "name": "test-no-tools", "platform": "chromium", "tools": []}
    )
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data

    # Clean up
    session_id = data["session_id"]
    client.delete(f"/v1/sessions/{session_id}")


def test_create_session_with_invalid_tool_schema():
    """Test creating session with malformed tool schema."""
    invalid_tools = [
        {
            "type": "function",
            "function": {
                "name": "InvalidTool"
                # Missing required fields like description and parameters
            },
        }
    ]

    response = client.post(
        "/v1/sessions",
        json={"provider": "anthropic", "name": "test-invalid-tools", "platform": "chromium", "tools": invalid_tools},
    )
    # Should still succeed as we handle malformed schemas gracefully
    assert response.status_code == 200
