from typing import Any

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
    ):
        self.session_id = session_id
        self.model = model

        self.cache = CacheFactory.create_cache()
        self.llm = LLMFactory.create_llm(model=model)
        self.llm.cache = self.cache

        self.actor_agent = ActorAgent(self.llm, tools)
        self.planner_agent = PlannerAgent(self.llm)
        self.retriever_agent = RetrieverAgent(self.llm)
        self.area_agent = AreaAgent(self.llm)
        self.locator_agent = LocatorAgent(self.llm)

        logger.info(f"Created session {session_id} with model {model.provider.value}/{model.name}")

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
