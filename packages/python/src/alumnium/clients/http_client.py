from __future__ import annotations

import atexit
import os
from os import getpid
from secrets import token_hex

from portpicker import pick_unused_port
from requests import ConnectionError, delete, get, post

from ..cli import run_server
from ..logutils import get_logger
from ..models import Model
from ..tools.base_tool import BaseTool
from ..tools.tool_to_schema_converter import convert_tools_to_schemas
from .typecasting import Data, loosely_typecast

logger = get_logger(__name__)

DEFAULT_SERVER_HOST = "127.0.0.1"


class HttpClient:
    def __init__(
        self,
        url: str | None,
        model: Model,
        platform: str,
        tools: dict[str, type[BaseTool]],
        planner: bool = True,
        exclude_attributes: set[str] | None = None,
    ):
        self._server_pid: str | None = None
        self.base_url = self._resolve_url(url)
        self.session_id = None

        tool_schemas = convert_tools_to_schemas(tools)

        response = post(
            f"{self.base_url}/v1/sessions",
            json={
                "provider": model.provider.value,
                "name": model.name,
                "tools": tool_schemas,
                "platform": platform,
                "planner": planner,
                "exclude_attributes": list(exclude_attributes or []),
            },
            timeout=30,
        )
        response.raise_for_status()
        self.session_id = response.json()["session_id"]

    def quit(self):
        try:
            if self.session_id:
                response = delete(
                    f"{self.base_url}/v1/sessions/{self.session_id}",
                    timeout=30,
                )
                response.raise_for_status()
                self.session_id = None
        except ConnectionError:
            if not self._server_pid:
                raise
            logger.debug("Skipping session cleanup: managed server already stopped")
        finally:
            self._stop_server()

    def plan_actions(self, goal: str, accessibility_tree: str, app: str = "unknown") -> tuple[str, list[str]]:
        """
        Plan actions to achieve a goal.
        Returns:
            A tuple of (explanation, steps).
        """
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/plans",
            json={"goal": goal, "accessibility_tree": accessibility_tree, "app": app},
            timeout=120,
        )
        response.raise_for_status()
        response_data = response.json()
        return (response_data["explanation"], response_data["steps"])

    def add_example(self, goal: str, actions: list[str]):
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/examples",
            json={"goal": goal, "actions": actions},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def clear_examples(self):
        response = delete(
            f"{self.base_url}/v1/sessions/{self.session_id}/examples",
            timeout=30,
        )
        response.raise_for_status()

    def execute_action(
        self, goal: str, step: str, accessibility_tree: str, app: str = "unknown"
    ) -> tuple[str, list[dict]]:
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/steps",
            json={"goal": goal, "step": step, "accessibility_tree": accessibility_tree, "app": app},
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        return data["explanation"], data["actions"]

    def retrieve(
        self,
        statement: str,
        accessibility_tree: str,
        title: str,
        url: str,
        screenshot: str | None,
        app: str = "unknown",
    ) -> tuple[str, Data]:
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/statements",
            json={
                "statement": statement,
                "accessibility_tree": accessibility_tree,
                "title": title,
                "url": url,
                "screenshot": screenshot if screenshot else None,
                "app": app,
            },
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        return data["explanation"], loosely_typecast(data["result"])

    def find_area(self, description: str, accessibility_tree: str, app: str = "unknown"):
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/areas",
            json={"description": description, "accessibility_tree": accessibility_tree, "app": app},
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        return {"id": data["id"], "explanation": data["explanation"]}

    def find_element(self, description: str, accessibility_tree: str, app: str = "unknown") -> dict:
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/elements",
            json={"description": description, "accessibility_tree": accessibility_tree, "app": app},
            timeout=60,
        )
        response.raise_for_status()
        return response.json()["elements"][0]

    def analyze_changes(
        self,
        before_accessibility_tree: str,
        before_url: str,
        after_accessibility_tree: str,
        after_url: str,
        app: str = "unknown",
    ) -> str:
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/changes",
            json={
                "before": {
                    "accessibility_tree": before_accessibility_tree,
                    "url": before_url,
                },
                "after": {
                    "accessibility_tree": after_accessibility_tree,
                    "url": after_url,
                },
                "app": app,
            },
            timeout=120,
        )
        response.raise_for_status()
        return response.json()["result"]

    def save_cache(self):
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/caches",
            timeout=30,
        )
        response.raise_for_status()

    def discard_cache(self):
        response = delete(
            f"{self.base_url}/v1/sessions/{self.session_id}/caches",
            timeout=30,
        )
        response.raise_for_status()

    @property
    def stats(self):
        response = get(
            f"{self.base_url}/v1/sessions/{self.session_id}/stats",
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def _resolve_url(self, url_option: str | None) -> str:
        if url_option:
            return url_option.rstrip("/")

        port = pick_unused_port()
        pid_name = self._build_server_pid_name(port)

        run_server(
            host=DEFAULT_SERVER_HOST,
            port=port,
            daemon=True,
            daemon_pid=pid_name,
            daemon_force=True,
            daemon_wait=True,
            check=True,
        )

        # Ensure to stop the server when the program exits
        atexit.register(self._stop_server)

        self._server_pid = pid_name
        managed_url = f"http://{DEFAULT_SERVER_HOST}:{port}"
        logger.debug(f"Started managed local server: {managed_url} ({pid_name})")
        return managed_url

    def _stop_server(self) -> None:
        if not self._server_pid:
            return

        run_server(
            daemon_kill=True,
            daemon_pid=self._server_pid,
            daemon_force=True,
        )
        logger.debug(f"Stopped managed local server ({self._server_pid})")
        self._server_pid = None

    @staticmethod
    def _build_server_pid_name(port: int) -> str:
        random_id = token_hex(4)[:7]
        return f"server-{getpid()}-{random_id}.pid"
