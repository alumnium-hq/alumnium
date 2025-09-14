import uuid
from typing import Any, Dict, List, Optional

from .logutils import get_logger
from .models import Model
from .schema_to_tool_converter import convert_schemas_to_tools
from .session import Session

logger = get_logger(__name__)


class SessionManager:
    """Manages multiple client sessions."""

    def __init__(self):
        self.sessions: dict[str, Session] = {}

    def create_session(self, provider: str, name: str, tools: List[Dict[str, Any]]) -> str:
        """Create a new session and return its ID.
        Args:
            provider: The model provider name
            tools: List of LangChain tool schemas
            name: The model name (optional)
        Returns:
            Session ID string
        """
        session_id = str(uuid.uuid4())

        logger.info(f"Creating session {session_id} with model {provider}/{name}")
        model = Model(provider=provider, name=name)

        # Convert tool schemas to tool classes
        tool_classes = convert_schemas_to_tools(tools)

        self.sessions[session_id] = Session(session_id=session_id, model=model, tools=tool_classes)
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
            session_stats = session.stats()
            for key in total_stats:
                total_stats[key] += session_stats[key]
        return total_stats
