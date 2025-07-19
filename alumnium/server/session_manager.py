import uuid
from typing import Dict, Optional

from .cache import Cache
from alumnium.logutils import get_logger
from .models import Model, SessionModel
from .llm_factory import LLMFactory
from .agents.planner_agent import PlannerAgent
from .agents.actor_agent import ActorAgent
from .agents.retriever_agent import RetrieverAgent

logger = get_logger(__name__)


class Session:
    """Represents a client session with its own agent instances."""

    def __init__(
        self,
        session_id: str,
        model: Model,
        azure_openai_api_version: str = None,
        aws_access_key: str = None,
        aws_secret_key: str = None,
        aws_region_name: str = "us-east-1",
    ):
        self.session_id = session_id
        self.model = model
        self.cache = Cache(model=model)

        # Create LLM using the factory
        self.llm = LLMFactory.create_llm(
            model=model,
            azure_openai_api_version=azure_openai_api_version,
            aws_access_key=aws_access_key,
            aws_secret_key=aws_secret_key,
            aws_region_name=aws_region_name,
        )
        self.llm.cache = self.cache

        # Initialize agents for this session
        # All agents now take accessibility_tree_xml as parameters instead of requiring a driver
        self.planner_agent = PlannerAgent(self.llm)
        self.actor_agent = ActorAgent(self.llm)
        self.retriever_agent = RetrieverAgent(self.llm)

        logger.info(f"Created session {session_id} with model {model.provider.value}/{model.name}")

    def get_stats(self) -> Dict[str, int]:
        """Get token usage statistics for this session."""
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
        self.sessions: Dict[str, Session] = {}

    def create_session(
        self,
        provider: str,
        name: Optional[str] = None,
        azure_openai_api_version: str = None,
        aws_access_key: str = None,
        aws_secret_key: str = None,
        aws_region_name: str = "us-east-1",
    ) -> str:
        """Create a new session and return its ID.

        Args:
            provider: The model provider name
            name: The model name (optional)
            azure_openai_api_version: Azure OpenAI API version (optional)
            aws_access_key: AWS access key (optional)
            aws_secret_key: AWS secret key (optional)
            aws_region_name: AWS region name (optional)

        Returns:
            Session ID string
        """
        session_id = str(uuid.uuid4())

        model = SessionModel(provider=provider, name=name)

        self.sessions[session_id] = Session(
            session_id=session_id,
            model=model,
            azure_openai_api_version=azure_openai_api_version,
            aws_access_key=aws_access_key,
            aws_secret_key=aws_secret_key,
            aws_region_name=aws_region_name,
        )
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
