from typing import Any

from langchain_core.language_models import BaseChatModel

from .accessibility import (
    BaseServerAccessibilityTree,
    ServerChromiumAccessibilityTree,
    ServerUIAutomator2AccessibilityTree,
    ServerXCUITestAccessibilityTree,
)
from .agents.actor_agent import ActorAgent
from .agents.area_agent import AreaAgent
from .agents.changes_analyzer_agent import ChangesAnalyzerAgent
from .agents.locator_agent import LocatorAgent
from .agents.planner_agent import PlannerAgent
from .agents.retriever_agent import RetrieverAgent
from .cache_factory import CacheFactory
from .llm_factory import LLMFactory
from .logutils import get_logger
from .models import Model
from .schema_to_tool_converter import convert_schemas_to_tools

logger = get_logger(__name__)


class Session:
    """Represents a client session with its own agent instances."""

    def __init__(
        self,
        session_id: str,
        model: Model,
        platform: str,
        tool_schemas: list[dict[str, Any]],
        llm: BaseChatModel | None = None,
        planner: bool = True,
        excluded_attributes: set[str] | None = None,
    ):
        self.session_id = session_id
        self.model = model
        self.platform = platform
        self.planner = planner
        self.tool_schemas = tool_schemas
        self.tools = convert_schemas_to_tools(self.tool_schemas)
        self.excluded_attributes = excluded_attributes or set()

        self.cache = CacheFactory.create_cache()
        if llm is not None:
            self.llm = llm
        else:
            self.llm = LLMFactory.create_llm(model=self.model)
        self.llm.cache = self.cache

        self.actor_agent = ActorAgent(self.llm, self.tools)
        self.planner_agent = PlannerAgent(self.llm, list(self.tools.keys()))
        self.retriever_agent = RetrieverAgent(self.llm)
        self.area_agent = AreaAgent(self.llm)
        self.locator_agent = LocatorAgent(self.llm)
        self.changes_analyzer_agent = ChangesAnalyzerAgent(self.llm)

        logger.info(
            f"Created session {session_id} with model {model.provider.value}/{model.name} and platform {platform}"
        )

    @property
    def stats(self) -> dict[str, dict[str, int]]:
        """
        Provides statistics about the usage of tokens.

        Returns:
            Two dictionaries containing the number of input tokens, output tokens, and total tokens used by all agents.
                - "total" includes the combined usage of all agents
                - "cache" includes only the usage of cached calls
        """
        return {
            "total": {
                "input_tokens": (
                    self.planner_agent.usage["input_tokens"]
                    + self.actor_agent.usage["input_tokens"]
                    + self.retriever_agent.usage["input_tokens"]
                    + self.area_agent.usage["input_tokens"]
                    + self.locator_agent.usage["input_tokens"]
                ),
                "output_tokens": (
                    self.planner_agent.usage["output_tokens"]
                    + self.actor_agent.usage["output_tokens"]
                    + self.retriever_agent.usage["output_tokens"]
                    + self.area_agent.usage["output_tokens"]
                    + self.locator_agent.usage["output_tokens"]
                ),
                "total_tokens": (
                    self.planner_agent.usage["total_tokens"]
                    + self.actor_agent.usage["total_tokens"]
                    + self.retriever_agent.usage["total_tokens"]
                    + self.area_agent.usage["total_tokens"]
                    + self.locator_agent.usage["total_tokens"]
                ),
            },
            "cache": self.cache.usage,
        }

    def process_tree(self, raw_tree_data: str) -> BaseServerAccessibilityTree:
        """
        Process raw platform data into a server tree.

        Args:
            raw_tree_data: Raw tree data as string (XML for all platforms)

        Returns:
            The created server tree instance
        """
        if self.platform == "chromium":
            tree = ServerChromiumAccessibilityTree(raw_tree_data)
        elif self.platform == "xcuitest":
            tree = ServerXCUITestAccessibilityTree(raw_tree_data)
        elif self.platform == "uiautomator2":
            tree = ServerUIAutomator2AccessibilityTree(raw_tree_data)
        else:
            raise ValueError(f"Unknown platform: {self.platform}")

        logger.debug(f"Processed tree for session {self.session_id}")
        return tree

    def to_state(self) -> dict[str, Any]:
        state = {
            "session_id": self.session_id,
            "model": self.model.to_state(),
            "platform": self.platform,
            "tools": self.tool_schemas,
            # "llm" is omitted even though it is passed in the constructor, as
            # 1) it's external and may not be serializable, and 2) in HTTP API
            # where sessions are exchanged, llm is never passed as a param.
            "planner": self.planner,
            "actor_agent": self.actor_agent.to_state(),
            "planner_agent": self.planner_agent.to_state(),
            "retriever_agent": self.retriever_agent.to_state(),
            "area_agent": self.area_agent.to_state(),
            "locator_agent": self.locator_agent.to_state(),
            "changes_analyzer_agent": self.changes_analyzer_agent.to_state(),
        }
        return state

    @classmethod
    def from_state(cls, state: dict[str, Any]) -> "Session":
        session = cls(
            session_id=state["session_id"],
            model=Model.from_state(state["model"]),
            platform=state["platform"],
            tool_schemas=state["tools"],
            # llm is not never in state, see note in to_state.
            planner=state["planner"],
        )

        session.actor_agent.apply_state(state["actor_agent"])
        session.planner_agent.apply_state(state["planner_agent"])
        session.retriever_agent.apply_state(state["retriever_agent"])
        session.area_agent.apply_state(state["area_agent"])
        session.locator_agent.apply_state(state["locator_agent"])
        session.changes_analyzer_agent.apply_state(state["changes_analyzer_agent"])

        return session
