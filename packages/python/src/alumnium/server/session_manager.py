import uuid
from typing import Any, Dict, List, Optional

from langchain_core.language_models import BaseChatModel

from .logutils import get_logger
from .models import Model
from .session import Session

logger = get_logger(__name__)


class SessionManager:
    """Manages multiple client sessions."""

    def __init__(self):
        self.sessions: dict[str, Session] = {}

    def create_session(
        self,
        provider: str,
        name: Optional[str],
        platform: str,
        tool_schemas: List[Dict[str, Any]],
        llm: BaseChatModel | None = None,
        session_id: str | None = None
    ) -> str:
        """Create a new session and return its ID.
        Args:
            provider: The model provider name
            name: The model name (optional)
            platform: The platform type (chromium, xcuitest, uiautomator2)
            tools: List of LangChain tool schemas
            llm: Optional custom LangChain Chat model instance
        Returns:
            Session ID string
        """
        session_id = session_id or str(uuid.uuid4())

        logger.info(f"Creating session {session_id} with model {provider}/{name} and platform {platform}")
        model = Model(provider=provider, name=name)

        self.sessions[session_id] = Session(
            session_id=session_id,
            model=model,
            platform=platform,
            tool_schemas=tool_schemas,
            llm=llm,
        )
        logger.info(f"Created new session: {session_id}")
        return session_id

    def apply_session_state(
        self,
        session_state: dict[str, Any],
    ) -> None:
        logger.info(f"Applying session state for session {session_state['session_id']}")
        logger.debug(f"Session state: {session_state}")
        session = Session.from_state(session_state)
        self.sessions[session.session_id] = session
        logger.info(f"Applied session state: {session.session_id}")

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

    def get_total_stats(self) -> Dict[str, Dict[str, int]]:
        """Get combined token usage statistics for all sessions."""
        total_stats = {
            "total": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
            "cache": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
        }
        for session in self.sessions.values():
            session_stats = session.stats
            for key in total_stats:
                total_stats[key]["input_tokens"] += session_stats[key]["input_tokens"]
                total_stats[key]["output_tokens"] += session_stats[key]["output_tokens"]
                total_stats[key]["total_tokens"] += session_stats[key]["total_tokens"]
        return total_stats
