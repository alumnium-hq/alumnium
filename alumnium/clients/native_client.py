from ..server.agents.retriever_agent import Data
from ..server.models import Model
from ..server.session_manager import SessionManager
from ..tools.base_tool import BaseTool
from ..tools.tool_to_schema_converter import convert_tools_to_schemas


class NativeClient:
    def __init__(self, model: Model, platform: str, tools: dict[str, type[BaseTool]]):
        self.session_manager = SessionManager()
        self.model = model
        self.tools = tools

        # Convert tools to schemas for API
        tool_schemas = convert_tools_to_schemas(tools)
        self.session_id = self.session_manager.create_session(
            provider=self.model.provider.value, name=self.model.name, tools=tool_schemas, platform=platform
        )

        self.session = self.session_manager.get_session(self.session_id)
        self.cache = self.session.cache

    def quit(self):
        self.session_manager.delete_session(self.session_id)

    def plan_actions(self, goal: str, accessibility_tree: str):
        accessibility_tree = self.session.process_tree(accessibility_tree)
        return self.session.planner_agent.invoke(goal, accessibility_tree.to_xml())

    def add_example(self, goal: str, actions: list[str]):
        return self.session.planner_agent.add_example(goal, actions)

    def clear_examples(self):
        self.session.planner_agent.prompt_with_examples.examples.clear()

    def execute_action(self, goal: str, step: str, accessibility_tree: str):
        accessibility_tree = self.session.process_tree(accessibility_tree)
        actions = self.session.actor_agent.invoke(goal, step, accessibility_tree.to_xml())
        return accessibility_tree.map_tool_calls_to_raw_id(actions)

    def retrieve(
        self,
        statement: str,
        accessibility_tree: str,
        title: str,
        url: str,
        screenshot: str | None,
    ) -> tuple[str, Data]:
        accessibility_tree = self.session.process_tree(accessibility_tree)
        return self.session.retriever_agent.invoke(
            statement,
            accessibility_tree.to_xml(),
            title=title,
            url=url,
            screenshot=screenshot,
        )

    def find_area(self, description: str, accessibility_tree: str):
        accessibility_tree = self.session.process_tree(accessibility_tree)
        area = self.session.area_agent.invoke(description, accessibility_tree.to_xml())
        return {"id": accessibility_tree.get_raw_id(area["id"]), "explanation": area["explanation"]}

    def find_element(self, description: str, accessibility_tree: str, area_id: int = None):
        accessibility_tree = self.session.process_tree(accessibility_tree)
        element = self.session.locator_agent.invoke(description, accessibility_tree.to_xml())[0]
        element["id"] = accessibility_tree.get_raw_id(element["id"])
        return element

    def save_cache(self):
        self.session.cache.save()

    def discard_cache(self):
        self.session.cache.discard()

    @property
    def stats(self):
        return self.session.stats
