import uuid
from typing import Any, Dict, List, Optional

from langchain_core.language_models import BaseChatModel

from .logutils import get_logger
from .models import Model
from .schema_to_tool_converter import convert_schemas_to_tools
from .session import Session

logger = get_logger(__name__)


class SessionManager:
    """Manages multiple client sessions."""

    def __init__(self):
        self.sessions: dict[str, Session] = {}

    def create_session(
        self,
        provider: str,
        name: str,
        platform: str,
        tools: List[Dict[str, Any]],
        llm: BaseChatModel | None = None,
        planner: bool = True,
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
        session_id = str(uuid.uuid4())

        logger.info(f"Creating session {session_id} with model {provider}/{name} and platform {platform}")
        model = Model(provider=provider, name=name)

        # Convert tool schemas to tool classes
        tool_classes = convert_schemas_to_tools(tools)

        self.sessions[session_id] = Session(
            session_id=session_id, model=model, platform=platform, tools=tool_classes, llm=llm, planner=planner
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
