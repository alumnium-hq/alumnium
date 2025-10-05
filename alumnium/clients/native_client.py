from typing import Dict, Type

from ..accessibility import RawAccessibilityTree
from ..server.agents.retriever_agent import Data
from ..server.models import Model
from ..server.session_manager import SessionManager
from ..tools.base_tool import BaseTool
from ..tools.tool_to_schema_converter import convert_tools_to_schemas


class NativeClient:
    def __init__(self, model: Model, tools: Dict[str, Type[BaseTool]]):
        self.session_manager = SessionManager()
        self.model = model
        self.tools = tools

        # Convert tools to schemas for API
        tool_schemas = convert_tools_to_schemas(tools)
        self.session_id = self.session_manager.create_session(
            provider=self.model.provider.value, name=self.model.name, tools=tool_schemas
        )

        self.session = self.session_manager.get_session(self.session_id)
        self.cache = self.session.cache

    def quit(self):
        self.session_manager.delete_session(self.session_id)

    def _process_tree(self, raw_tree: RawAccessibilityTree) -> str:
        """Process raw tree and return XML."""
        return self.session.process_raw_tree(raw_tree.raw_data, raw_tree.automation_type)

    def plan_actions(self, goal: str, raw_tree: RawAccessibilityTree):
        xml = self._process_tree(raw_tree)
        return self.session.planner_agent.invoke(goal, xml)

    def add_example(self, goal: str, actions: list[str]):
        return self.session.planner_agent.add_example(goal, actions)

    def clear_examples(self):
        self.session.planner_agent.prompt_with_examples.examples.clear()

    def execute_action(self, goal: str, step: str, raw_tree: RawAccessibilityTree):
        xml = self._process_tree(raw_tree)
        return self.session.actor_agent.invoke(goal, step, xml)

    def retrieve(
        self,
        statement: str,
        raw_tree: RawAccessibilityTree,
        title: str,
        url: str,
        screenshot: str | None,
    ) -> tuple[str, Data]:
        xml = self._process_tree(raw_tree)
        return self.session.retriever_agent.invoke(
            statement, xml, title=title, url=url, screenshot=screenshot
        )

    def find_area(self, description: str, raw_tree: RawAccessibilityTree):
        xml = self._process_tree(raw_tree)
        return self.session.area_agent.invoke(description, xml)

    def find_element(self, description: str, raw_tree: RawAccessibilityTree):
        xml = self._process_tree(raw_tree)
        return self.session.locator_agent.invoke(description, xml)[0]

    def save_cache(self):
        self.session.cache.save()

    def discard_cache(self):
        self.session.cache.discard()

    @property
    def stats(self):
        return self.session.stats
