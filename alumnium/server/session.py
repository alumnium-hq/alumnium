import json
from typing import Any, Optional

from .accessibility import (
    BaseServerTree,
    ChromiumServerTree,
    UIAutomator2ServerTree,
    XCUITestServerTree,
)
from .agents.actor_agent import ActorAgent
from .agents.area_agent import AreaAgent
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
        tools: dict[str, Any],
        platform: str,
    ):
        self.session_id = session_id
        self.model = model
        self.platform = platform
        self.current_tree: Optional[BaseServerTree] = None
        self.current_area_id: Optional[int] = None  # Track which area we're working with

        self.cache = CacheFactory.create_cache()
        self.llm = LLMFactory.create_llm(model=model)
        self.llm.cache = self.cache

        self.actor_agent = ActorAgent(self.llm, tools)
        self.planner_agent = PlannerAgent(self.llm)
        self.retriever_agent = RetrieverAgent(self.llm)
        self.area_agent = AreaAgent(self.llm)
        self.locator_agent = LocatorAgent(self.llm)

        logger.info(f"Created session {session_id} with model {model.provider.value}/{model.name} and platform {platform}")

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

    def update_tree(self, raw_tree_data: str, area_id: Optional[int] = None) -> BaseServerTree:
        """
        Update the session's accessibility tree from raw platform data.

        Args:
            raw_tree_data: Raw tree data as string (JSON string for Chromium, XML for others)
            area_id: Optional area ID to scope the tree to after processing

        Returns:
            The created server tree instance (potentially scoped to area)
        """
        if self.platform == "chromium":
            tree_dict = json.loads(raw_tree_data)
            full_tree = ChromiumServerTree(tree_dict)
        elif self.platform == "xcuitest":
            full_tree = XCUITestServerTree(raw_tree_data)
        elif self.platform == "uiautomator2":
            full_tree = UIAutomator2ServerTree(raw_tree_data)
        else:
            raise ValueError(f"Unknown platform: {self.platform}")

        # If area_id is provided, scope to that area
        if area_id is not None:
            self.current_tree = full_tree.get_area(area_id)
            self.current_area_id = area_id
            logger.debug(f"Updated tree for session {self.session_id} and scoped to area {area_id}")
        else:
            self.current_tree = full_tree
            self.current_area_id = None
            logger.debug(f"Updated tree for session {self.session_id}")

        return self.current_tree

    def get_tree(self) -> BaseServerTree:
        """Get the current accessibility tree."""
        if self.current_tree is None:
            raise ValueError("No accessibility tree has been set for this session")
        return self.current_tree

    def map_tool_calls_to_raw(self, tool_calls: list[dict]) -> list[dict]:
        """Map simplified IDs in tool calls back to raw platform IDs."""
        if self.current_tree is None:
            raise ValueError("No accessibility tree has been set for this session")
        return self.current_tree.map_tool_calls_to_raw(tool_calls)
