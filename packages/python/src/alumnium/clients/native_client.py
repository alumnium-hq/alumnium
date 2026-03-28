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
        exclude_attributes: set[str] | None = None,
    ):
        self.session_manager = SessionManager()
        self.model = model
        self.tools = tools

        # Convert tools to schemas for API
        tool_schemas = convert_tools_to_schemas(tools)
        self.session_id = self.session_manager.create_session(
            provider=self.model.provider.value,
            name=self.model.name,
            tool_schemas=tool_schemas,
            platform=platform,
            llm=llm,
            planner=planner,
            exclude_attributes=exclude_attributes or set(),
        )

        self.session = self.session_manager.get_session(self.session_id)
        self.cache = self.session.cache

    def quit(self):
        self.session_manager.delete_session(self.session_id)

    def plan_actions(self, goal: str, accessibility_tree: str, app: str = "unknown") -> tuple[str, list[str]]:
        """
        Plan actions to achieve a goal.
        Returns:
            A tuple of (explanation, steps).
        """
        if not self.session.planner:
            return (goal, [goal])

        self.cache.app = app
        accessibility_tree = self.session.process_tree(accessibility_tree)
        return self.session.planner_agent.invoke(
            goal, accessibility_tree.to_xml(exclude_attrs=self.session.exclude_attributes)
        )

    def add_example(self, goal: str, actions: list[str]):
        logger.debug(f"Adding example. Goal: {goal}, Actions: {actions}")
        return self.session.planner_agent.add_example(goal, actions)

    def clear_examples(self):
        self.session.planner_agent.prompt_with_examples.examples.clear()

    def execute_action(
        self, goal: str, step: str, accessibility_tree: str, app: str = "unknown"
    ) -> tuple[str, list[dict]]:
        self.cache.app = app
        accessibility_tree = self.session.process_tree(accessibility_tree)
        explanation, actions = self.session.actor_agent.invoke(
            goal, step, accessibility_tree.to_xml(exclude_attrs=self.session.exclude_attributes)
        )
        return explanation, accessibility_tree.map_tool_calls_to_raw_id(actions)

    def retrieve(
        self,
        statement: str,
        accessibility_tree: str,
        title: str,
        url: str,
        screenshot: str | None,
        app: str = "unknown",
    ) -> tuple[str, Data]:
        self.cache.app = app
        accessibility_tree = self.session.process_tree(accessibility_tree)
        exclude_attrs = self.session.retriever_agent.EXCLUDE_ATTRIBUTES | self.session.exclude_attributes
        explanation, result = self.session.retriever_agent.invoke(
            statement,
            accessibility_tree.to_xml(exclude_attrs=exclude_attrs),
            title=title,
            url=url,
            screenshot=screenshot,
        )
        return explanation, loosely_typecast(result)

    def find_area(self, description: str, accessibility_tree: str, app: str = "unknown"):
        self.cache.app = app
        accessibility_tree = self.session.process_tree(accessibility_tree)
        area = self.session.area_agent.invoke(
            description, accessibility_tree.to_xml(exclude_attrs=self.session.exclude_attributes)
        )
        return {"id": accessibility_tree.get_raw_id(area["id"]), "explanation": area["explanation"]}

    def find_element(self, description: str, accessibility_tree: str, app: str = "unknown") -> dict:
        self.cache.app = app
        accessibility_tree = self.session.process_tree(accessibility_tree)
        element = self.session.locator_agent.invoke(
            description, accessibility_tree.to_xml(exclude_attrs=self.session.exclude_attributes)
        )[0]
        element["id"] = accessibility_tree.get_raw_id(element["id"])
        return element

    def analyze_changes(
        self,
        before_accessibility_tree: str,
        before_url: str,
        after_accessibility_tree: str,
        after_url: str,
        app: str = "unknown",
    ) -> str:
        self.cache.app = app
        before_tree = self.session.process_tree(before_accessibility_tree)
        after_tree = self.session.process_tree(after_accessibility_tree)
        exclude_attrs = self.session.changes_analyzer_agent.EXCLUDE_ATTRIBUTES | self.session.exclude_attributes
        diff = AccessibilityTreeDiff(
            before_tree.to_xml(exclude_attrs=exclude_attrs),
            after_tree.to_xml(exclude_attrs=exclude_attrs),
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
