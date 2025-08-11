import uuid
from typing import Dict, Optional

from alumnium.logutils import get_logger
from alumnium.models import Model
from alumnium.session import Session
from alumnium.tools import ALL_TOOLS

logger = get_logger(__name__)


class ServerSessionManager:
    """Server-side session manager for handling multiple client sessions."""

    def __init__(self):
        self.sessions: Dict[str, Session] = {}

    def create_session(self, model: Optional[Model] = None) -> str:
        """Create a new session and return its ID."""
        session_id = str(uuid.uuid4())

        # Use current model if none provided
        session_model = model or Model.current

        # Create session with tools
        session = Session(session_id=session_id, model=session_model, tools=ALL_TOOLS)

        self.sessions[session_id] = session
        logger.info(f"Created server session: {session_id}")
        return session_id

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get a session by ID."""
        return self.sessions.get(session_id)

    def delete_session(self, session_id: str) -> bool:
        """Delete a session by ID."""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Deleted server session: {session_id}")
            return True
        return False

    def list_sessions(self) -> list[str]:
        """List all active session IDs."""
        return list(self.sessions.keys())

    def get_session_stats(self, session_id: str) -> Optional[dict]:
        """Get stats for a specific session."""
        session = self.get_session(session_id)
        if session:
            return session.stats()
        return None
