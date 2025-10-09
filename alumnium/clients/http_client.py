from requests import delete, get, post

from ..accessibility import AccessibilityElement, RawAccessibilityTree
from ..server.agents.retriever_agent import Data
from ..server.models import Model
from ..tools.base_tool import BaseTool
from ..tools.tool_to_schema_converter import convert_tools_to_schemas


class HttpClient:
    def __init__(self, base_url: str, model: Model, tools: dict[str, type[BaseTool]]):
        self.base_url = base_url.rstrip("/")
        self.session_id = None
        self.id_mappings = {}  # Store ID mappings from server

        tool_schemas = convert_tools_to_schemas(tools)

        response = post(
            f"{self.base_url}/v1/sessions",
            json={"provider": model.provider.value, "name": model.name, "tools": tool_schemas},
            timeout=30,
        )
        response.raise_for_status()
        self.session_id = response.json()["session_id"]

    def quit(self):
        if self.session_id:
            response = delete(
                f"{self.base_url}/v1/sessions/{self.session_id}",
                timeout=30,
            )
            response.raise_for_status()
            self.session_id = None

    def plan_actions(self, goal: str, accessibility_tree: str):
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/plans",
            json={"goal": goal, "accessibility_tree": accessibility_tree},
            timeout=120,
        )
        response.raise_for_status()
        return response.json()["steps"]

    def add_example(self, goal: str, actions: list[str]):
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/examples",
            json={"goal": goal, "actions": actions},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def element_by_id(self, id: int) -> AccessibilityElement:
        """Look up element by ID from stored mappings."""
        if id not in self.id_mappings:
            raise KeyError(f"No element with id={id}")
        backend_id = self.id_mappings[id]
        return AccessibilityElement(id=backend_id)

    def clear_examples(self):
        response = delete(
            f"{self.base_url}/v1/sessions/{self.session_id}/examples",
            timeout=30,
        )
        response.raise_for_status()

    def execute_action(self, goal: str, step: str, accessibility_tree: str):
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/steps",
            json={"goal": goal, "step": step, "accessibility_tree": accessibility_tree},
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        # Store ID mappings if provided
        if "id_mappings" in data:
            self.id_mappings = {int(k): v for k, v in data["id_mappings"].items()}
        return data["actions"]

    def retrieve(
        self,
        statement: str,
        raw_tree: RawAccessibilityTree,
        title: str,
        url: str,
        screenshot: str | None,
    ) -> tuple[str, Data]:
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/statements",
            json={
                "statement": statement,
                "raw_data": raw_tree.raw_data,
                "automation_type": raw_tree.automation_type,
                "title": title,
                "url": url,
                "screenshot": screenshot if screenshot else None,
            },
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        # Store ID mappings if provided
        if "id_mappings" in data:
            self.id_mappings = {int(k): v for k, v in data["id_mappings"].items()}
        return data["explanation"], data["result"]

    def find_area(self, description: str, raw_tree: RawAccessibilityTree):
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/areas",
            json={
                "description": description,
                "raw_data": raw_tree.raw_data,
                "automation_type": raw_tree.automation_type,
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        # Store ID mappings if provided
        if "id_mappings" in data:
            self.id_mappings = {int(k): v for k, v in data["id_mappings"].items()}
        return {"id": data["id"], "explanation": data["explanation"]}

    def find_element(self, description: str, raw_tree: RawAccessibilityTree):
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/elements",
            json={
                "description": description,
                "raw_data": raw_tree.raw_data,
                "automation_type": raw_tree.automation_type,
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        # Store ID mappings if provided
        if "id_mappings" in data:
            self.id_mappings = {int(k): v for k, v in data["id_mappings"].items()}
        return data["elements"][0]

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
