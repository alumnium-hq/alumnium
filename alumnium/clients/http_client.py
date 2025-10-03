from requests import delete, get, post

from ..server.agents.retriever_agent import Data
from ..server.models import Model
from ..tools.base_tool import BaseTool
from ..tools.tool_to_schema_converter import convert_tools_to_schemas


class HttpClient:
    def __init__(self, base_url: str, model: Model, tools: dict[str, type[BaseTool]]):
        self.base_url = base_url.rstrip("/")
        self.session_id = None
        self.cache = None  # HTTP client doesn't support cache access

        tool_schemas = convert_tools_to_schemas(tools)

        response = post(
            f"{self.base_url}/v1/sessions",
            json={"provider": model.provider.value, "name": model.name, "tools": tool_schemas},
            timeout=30,
        )
        response.raise_for_status()
        self.session_id = response.json()["sessionId"]

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
        return response.json()["actions"]

    def retrieve(
        self,
        statement: str,
        accessibility_tree: str,
        title: str,
        url: str,
        screenshot: bytes | None,
    ) -> tuple[str, Data]:
        # Encode screenshot to base64 if provided
        screenshot_b64 = None
        if screenshot:
            screenshot_b64 = b64encode(screenshot).decode("utf-8")

        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/statements",
            json={
                "statement": statement,
                "accessibility_tree": accessibility_tree,
                "title": title,
                "url": url,
                "screenshot": screenshot_b64,
            },
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        return data["explanation"], data["result"]

    def find_area(self, description: str, accessibility_tree: str):
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/areas",
            json={"description": description, "accessibility_tree": accessibility_tree},
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        return {"id": data["id"], "explanation": data["explanation"]}

    def find_element(self, description: str, accessibility_tree: str):
        response = post(
            f"{self.base_url}/v1/sessions/{self.session_id}/elements",
            json={"description": description, "accessibility_tree": accessibility_tree},
            timeout=60,
        )
        response.raise_for_status()
        return response.json()["elements"][0]

    @property
    def stats(self):
        response = get(
            f"{self.base_url}/v1/sessions/{self.session_id}/stats",
            timeout=30,
        )
        response.raise_for_status()
        return response.json()
