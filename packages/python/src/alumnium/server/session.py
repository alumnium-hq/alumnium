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

logger = get_logger(__name__)


class Session:
    """Represents a client session with its own agent instances."""

    def __init__(
        self,
        session_id: str,
        model: Model,
        platform: str,
        tools: dict[str, Any],
        llm: BaseChatModel | None = None,
        planner: bool = True,
    ):
        self.session_id = session_id
        self.model = model
        self.platform = platform
        self.planner = planner

        self.cache = CacheFactory.create_cache()
        if llm is not None:
            self.llm = llm
        else:
            self.llm = LLMFactory.create_llm(model=model)
        self.llm.cache = self.cache

        self.actor_agent = ActorAgent(self.llm, tools)
        self.planner_agent = PlannerAgent(self.llm, list(tools.keys()))
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
