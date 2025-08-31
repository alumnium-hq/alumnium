import uuid
from typing import Dict, Optional

from alumnium.agents.area_agent import AreaAgent
from alumnium.logutils import get_logger
from alumnium.tools import BaseTool

from .agents.actor_agent import ActorAgent
from .agents.planner_agent import PlannerAgent
from .agents.retriever_agent import RetrieverAgent
from .fscache import FSCache
from .llm_factory import LLMFactory
from .models import Model, Provider

logger = get_logger(__name__)


class Session:
    """Represents a client session with its own agent instances."""

    def __init__(
        self,
        session_id: str,
        model: Model,
        tools: dict[str, BaseTool],
    ):
        self.session_id = session_id
        self.model = model
        self.cache = FSCache()

        # Create LLM using the factory
        self.llm = LLMFactory.create_llm(model=model)
        self.llm.cache = self.cache

        self.actor_agent = ActorAgent(self.llm, tools)
        self.planner_agent = PlannerAgent(self.llm)
        self.retriever_agent = RetrieverAgent(self.llm)
        self.area_agent = AreaAgent(self.llm)

        logger.info(f"Created session {session_id} with model {model.provider.value}/{model.name}")

    def stats(self) -> dict[str, int]:
        """
        Provides statistics about the usage of tokens.

        Returns:
            A dictionary containing the number of input tokens, output tokens, and total tokens used by all agents.
        """
        return {
            "input_tokens": (
                self.planner_agent.usage["input_tokens"]
                + self.actor_agent.usage["input_tokens"]
                + self.retriever_agent.usage["input_tokens"]
            ),
            "output_tokens": (
                self.planner_agent.usage["output_tokens"]
                + self.actor_agent.usage["output_tokens"]
                + self.retriever_agent.usage["output_tokens"]
            ),
            "total_tokens": (
                self.planner_agent.usage["total_tokens"]
                + self.actor_agent.usage["total_tokens"]
                + self.retriever_agent.usage["total_tokens"]
            ),
        }


class SessionManager:
    """Manages multiple client sessions."""

    def __init__(self):
        self.sessions: dict[str, Session] = {}

    def create_session(self, provider: Provider, name: str, tools: dict[str, BaseTool]) -> str:
        """Create a new session and return its ID.
        Args:
            provider: The model provider name
            tools: The tools to use in the session
            name: The model name (optional)
        Returns:
            Session ID string
        """
        session_id = str(uuid.uuid4())

        model = Model(provider=provider, name=name)

        self.sessions[session_id] = Session(session_id=session_id, model=model, tools=tools)
        logger.info(f"Created new session: {session_id}")
        return session_id

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get a session by ID."""
        return self.sessions.get(session_id)

    def delete_session(self, session_id: str) -> bool:
        """Delete a session by ID."""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Deleted session: {session_id}")
            return True
        return False

    def list_sessions(self) -> list[str]:
        """List all active session IDs."""
        return list(self.sessions.keys())

    def get_total_stats(self) -> Dict[str, int]:
        """Get combined token usage statistics for all sessions."""
        total_stats = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        for session in self.sessions.values():
            session_stats = session.get_stats()
            for key in total_stats:
                total_stats[key] += session_stats[key]
        return total_stats
