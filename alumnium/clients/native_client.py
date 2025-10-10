from ..server.agents.retriever_agent import Data
from ..server.models import Model
from ..server.session_manager import SessionManager
from ..tools.base_tool import BaseTool
from ..tools.tool_to_schema_converter import convert_tools_to_schemas


class NativeClient:
    def __init__(self, model: Model, tools: dict[str, type[BaseTool]], platform: str):
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

    def plan_actions(self, goal: str, raw_tree: str, area_id: int = None):
        # Process raw tree
        full_tree = self.session.update_tree(raw_tree)

        # Scope to area if area_id provided
        if area_id is not None:
            tree = full_tree.get_area(area_id)
        else:
            tree = full_tree

        tree_xml = tree.to_xml()
        return self.session.planner_agent.invoke(goal, tree_xml)

    def add_example(self, goal: str, actions: list[str]):
        return self.session.planner_agent.add_example(goal, actions)

    def clear_examples(self):
        self.session.planner_agent.prompt_with_examples.examples.clear()

    def execute_action(self, goal: str, step: str, raw_tree: str, area_id: int = None):
        # Process raw tree
        full_tree = self.session.update_tree(raw_tree)

        # Scope to area if area_id provided
        if area_id is not None:
            tree = full_tree.get_area(area_id)
        else:
            tree = full_tree

        tree_xml = tree.to_xml()
        actions = self.session.actor_agent.invoke(goal, step, tree_xml)

        # Map IDs using the FULL tree (not scoped tree)
        return full_tree.map_tool_calls_to_raw(actions)

    def retrieve(
        self,
        statement: str,
        raw_tree: str,
        title: str,
        url: str,
        screenshot: str | None,
        area_id: int = None,
    ) -> tuple[str, Data]:
        # Process raw tree
        full_tree = self.session.update_tree(raw_tree)

        # Scope to area if area_id provided
        if area_id is not None:
            tree = full_tree.get_area(area_id)
        else:
            tree = full_tree

        tree_xml = tree.to_xml()
        return self.session.retriever_agent.invoke(
            statement, tree_xml, title=title, url=url, screenshot=screenshot
        )

    def find_area(self, description: str, raw_tree: str):
        # Process raw tree data
        tree = self.session.update_tree(raw_tree)
        tree_xml = tree.to_xml()

        area = self.session.area_agent.invoke(description, tree_xml)

        return area

    def find_element(self, description: str, raw_tree: str, area_id: int = None):
        # Process raw tree
        full_tree = self.session.update_tree(raw_tree)

        # Scope to area if area_id provided
        if area_id is not None:
            tree = full_tree.get_area(area_id)
        else:
            tree = full_tree

        tree_xml = tree.to_xml()
        element = self.session.locator_agent.invoke(description, tree_xml)[0]

        # Map ID using the FULL tree (not scoped tree)
        element["id"] = full_tree.map_id_to_raw(element["id"])

        return element

    def save_cache(self):
        self.session.cache.save()

    def discard_cache(self):
        self.session.cache.discard()

    @property
    def stats(self):
        return self.session.stats
