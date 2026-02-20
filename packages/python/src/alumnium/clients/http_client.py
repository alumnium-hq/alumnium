from requests import delete, get, post

from ..server.models import Model
from ..tools.base_tool import BaseTool
from ..tools.tool_to_schema_converter import convert_tools_to_schemas
from .typecasting import Data, loosely_typecast


class HttpClient:
    def __init__(
        self,
        base_url: str,
        model: Model,
        platform: str,
        tools: dict[str, type[BaseTool]],
        planner: bool = True,
    ):
        self.base_url = base_url.rstrip("/")
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
            },
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

    def plan_actions(self, goal: str, accessibility_tree: str) -> tuple[str, list[str]]:
        """
        Plan actions to achieve a goal.
        Returns:
            A tuple of (explanation, steps).
        """
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/plans",
            json={"goal": goal, "accessibility_tree": accessibility_tree},
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

    def execute_action(self, goal: str, step: str, accessibility_tree: str) -> tuple[str, list[dict]]:
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/steps",
            json={"goal": goal, "step": step, "accessibility_tree": accessibility_tree},
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
    ) -> tuple[str, Data]:
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/statements",
            json={
                "statement": statement,
                "accessibility_tree": accessibility_tree,
                "title": title,
                "url": url,
                "screenshot": screenshot if screenshot else None,
            },
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        return data["explanation"], loosely_typecast(data["result"])

    def find_area(self, description: str, accessibility_tree: str):
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/areas",
            json={"description": description, "accessibility_tree": accessibility_tree},
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        return {"id": data["id"], "explanation": data["explanation"]}

    def find_element(self, description: str, accessibility_tree: str) -> dict:
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/elements",
            json={"description": description, "accessibility_tree": accessibility_tree},
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
