import pytest
from fastapi.testclient import TestClient

from alumnium.server.main import app

client = TestClient(app)


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
    response = client.post("/sessions", json={"provider": "anthropic", "name": "test_name", "tools": {}})
    assert response.status_code == 200
    data = response.json()
    assert "sessionId" in data
    assert isinstance(data["sessionId"], str)
    return data["sessionId"]


def test_list_sessions():
    """Test listing sessions."""
    # Create a session first
    session_id = test_create_session()

    response = client.get("/sessions")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert session_id in data


def test_delete_session():
    """Test deleting a session."""
    # Create a session first
    session_id = test_create_session()

    # Delete the session
    response = client.delete(f"/sessions/{session_id}")
    assert response.status_code == 204

    # Verify it's gone
    response = client.get("/sessions")
    data = response.json()
    assert session_id not in data


def test_delete_nonexistent_session():
    """Test deleting a session that doesn't exist."""
    response = client.delete("/sessions/nonexistent")
    assert response.status_code == 404


def test_session_stats():
    """Test getting session stats."""
    # Create a session first
    session_id = test_create_session()

    response = client.get(f"/sessions/{session_id}/stats")
    assert response.status_code == 200
    data = response.json()
    assert "input_tokens" in data
    assert "output_tokens" in data
    assert "total_tokens" in data


def test_session_stats_nonexistent():
    """Test getting stats for nonexistent session."""
    response = client.get("/sessions/nonexistent/stats")
    assert response.status_code == 404
