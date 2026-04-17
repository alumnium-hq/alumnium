from uuid import uuid4

import httpx
from portpicker import pick_unused_port

from alumnium import Model
from alumnium.cli import run_server


def test_server_starts_and_health_endpoint_responds():
    server_pid = f"pytest-{uuid4().hex}.pid"
    port = pick_unused_port()

    try:
        run_server(
            port=port,
            daemon=True,
            daemon_pid=server_pid,
            daemon_force=True,
            daemon_wait=True,
        )

        response = httpx.get(f"http://localhost:{port}/v1/health", timeout=10.0)

        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "healthy"
        assert isinstance(payload["model"], str)
        model = Model.from_string(payload["model"])
        assert model.name
    finally:
        run_server(
            daemon_kill=True,
            daemon_pid=server_pid,
            daemon_force=True,
        )
