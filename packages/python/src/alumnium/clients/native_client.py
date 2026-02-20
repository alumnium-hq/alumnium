from langchain_core.language_models import BaseChatModel

from ..server.accessibility import AccessibilityTreeDiff
from ..server.logutils import get_logger
from ..server.models import Model
from ..server.session_manager import SessionManager
from ..tools.base_tool import BaseTool
from ..tools.tool_to_schema_converter import convert_tools_to_schemas
from .typecasting import Data, loosely_typecast

logger = get_logger(__name__)


class NativeClient:
    def __init__(
        self,
        model: Model,
        platform: str,
        tools: dict[str, type[BaseTool]],
        llm: BaseChatModel | None = None,
        planner: bool = True,
    ):
        self.session_manager = SessionManager()
        self.model = model
        self.tools = tools

        # Convert tools to schemas for API
        tool_schemas = convert_tools_to_schemas(tools)
        self.session_id = self.session_manager.create_session(
            provider=self.model.provider.value,
            name=self.model.name,
            tools=tool_schemas,
            platform=platform,
            llm=llm,
            planner=planner,
        )

        self.session = self.session_manager.get_session(self.session_id)
        self.cache = self.session.cache

    def quit(self):
        self.session_manager.delete_session(self.session_id)

    def plan_actions(self, goal: str, accessibility_tree: str) -> tuple[str, list[str]]:
        """
        Plan actions to achieve a goal.
        Returns:
            A tuple of (explanation, steps).
        """
        if not self.session.planner:
            return (goal, [goal])

        accessibility_tree = self.session.process_tree(accessibility_tree)
        return self.session.planner_agent.invoke(goal, accessibility_tree.to_xml())

    def add_example(self, goal: str, actions: list[str]):
        logger.debug(f"Adding example. Goal: {goal}, Actions: {actions}")
        return self.session.planner_agent.add_example(goal, actions)

    def clear_examples(self):
        self.session.planner_agent.prompt_with_examples.examples.clear()

    def execute_action(self, goal: str, step: str, accessibility_tree: str) -> tuple[str, list[dict]]:
        accessibility_tree = self.session.process_tree(accessibility_tree)
        explanation, actions = self.session.actor_agent.invoke(goal, step, accessibility_tree.to_xml())
        return explanation, accessibility_tree.map_tool_calls_to_raw_id(actions)

    def retrieve(
        self,
        statement: str,
        accessibility_tree: str,
        title: str,
        url: str,
        screenshot: str | None,
    ) -> tuple[str, Data]:
        accessibility_tree = self.session.process_tree(accessibility_tree)
        explanation, result = self.session.retriever_agent.invoke(
            statement, accessibility_tree.to_xml(), title=title, url=url, screenshot=screenshot
        )
        return explanation, loosely_typecast(result)

    def find_area(self, description: str, accessibility_tree: str):
        accessibility_tree = self.session.process_tree(accessibility_tree)
        area = self.session.area_agent.invoke(description, accessibility_tree.to_xml())
        return {"id": accessibility_tree.get_raw_id(area["id"]), "explanation": area["explanation"]}

    def find_element(self, description: str, accessibility_tree: str) -> dict:
        accessibility_tree = self.session.process_tree(accessibility_tree)
        element = self.session.locator_agent.invoke(description, accessibility_tree.to_xml())[0]
        element["id"] = accessibility_tree.get_raw_id(element["id"])
        return element

    def analyze_changes(
        self,
        before_accessibility_tree: str,
        before_url: str,
        after_accessibility_tree: str,
        after_url: str,
    ) -> str:
        before_tree = self.session.process_tree(before_accessibility_tree)
        after_tree = self.session.process_tree(after_accessibility_tree)
        diff = AccessibilityTreeDiff(
            before_tree.to_xml(exclude_attrs={"id"}),
            after_tree.to_xml(exclude_attrs={"id"}),
        )

        analysis = ""
        if before_url and after_url:
            if before_url != after_url:
                analysis = f"URL changed to {after_url}. "
            else:
                analysis = "URL did not change. "

        analysis += self.session.changes_analyzer_agent.invoke(diff.compute())

        return analysis

    def save_cache(self):
        self.session.cache.save()

    def discard_cache(self):
        self.session.cache.discard()

    @property
    def stats(self):
        return self.session.stats
