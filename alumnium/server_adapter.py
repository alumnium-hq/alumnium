from typing import Any, Dict, List, Optional

from .server.models import (
    ActionResponse,
    DataResponse,
    StepResponse,
    VerificationResponse,
)
from .server.service import Service
from .server.session_manager import SessionManager


class ServerAdapter:
    """
    In-memory client for the Alumnium server.

    This client directly calls the server's endpoint methods without
    HTTP serialization, providing the same interface as the HTTP server
    but running in the same process.
    """

    def __init__(self):
        """Initialize the server client with a session manager."""
        self.session_manager = SessionManager()

    def create_session(
        self,
        provider: str,
        name: Optional[str] = None,
        azure_openai_api_version: Optional[str] = None,
        aws_access_key: Optional[str] = None,
        aws_secret_key: Optional[str] = None,
        aws_region_name: Optional[str] = None,
    ) -> str:
        """
        Create a new session with model configuration.

        Args:
            model: Model configuration dictionary
            azure_openai_api_version: Azure OpenAI API version (optional)
            aws_access_key: AWS access key (optional)
            aws_secret_key: AWS secret key (optional)
            aws_region_name: AWS region name (optional)

        Returns:
            Session ID string
        """
        try:
            session_id = self.session_manager.create_session(
                provider=provider,
                name=name,
                azure_openai_api_version=azure_openai_api_version,
                aws_access_key=aws_access_key,
                aws_secret_key=aws_secret_key,
                aws_region_name=aws_region_name,
            )
            return session_id
        except ValueError as e:
            raise ValueError(f"Invalid request: {str(e)}")
        except Exception as e:
            raise Exception(f"Failed to create session: {str(e)}")

    def delete_session(self, session_id: str) -> bool:
        """
        Delete a session.

        Args:
            session_id: The session ID to delete

        Returns:
            True if session was deleted, False if not found
        """
        try:
            return self.session_manager.delete_session(session_id)
        except Exception as e:
            raise Exception(f"Failed to delete session: {str(e)}")

    def list_sessions(self) -> List[str]:
        """
        List all active sessions.

        Returns:
            List of session IDs
        """
        try:
            return self.session_manager.list_sessions()
        except Exception as e:
            raise Exception(f"Failed to list sessions: {str(e)}")

    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """
        Get statistics for a specific session.

        Args:
            session_id: The session ID

        Returns:
            Session statistics dictionary
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
            return session.get_stats()
        except ValueError:
            raise
        except Exception as e:
            raise Exception(f"Failed to get session stats: {str(e)}")

    def get_total_stats(self) -> Dict[str, Any]:
        """
        Get total statistics for all sessions.

        Returns:
            Total statistics dictionary
        """
        try:
            return self.session_manager.get_total_stats()
        except Exception as e:
            raise Exception(f"Failed to get total stats: {str(e)}")

    def plan_actions(
        self,
        session_id: str,
        goal: str,
        aria: str,
        url: Optional[str] = None,
        title: Optional[str] = None,
    ) -> ActionResponse:
        """
        Plan actions to achieve a goal.

        Args:
            session_id: The session ID
            goal: The goal to achieve
            aria: ARIA XML string
            url: Current URL (optional)
            title: Page title (optional)

        Returns:
            ActionResponse with planned actions
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            service = Service(session)
            return service.plan_actions(goal=goal, aria=aria, url=url, title=title)
        except ValueError:
            raise
        except Exception as e:
            raise Exception(f"Failed to plan actions: {str(e)}")

    def execute_step(
        self,
        session_id: str,
        goal: str,
        step: str,
        aria: str,
    ) -> StepResponse:
        """
        Execute a single step using the actor agent.

        Args:
            session_id: The session ID
            goal: The goal to achieve
            step: The step to execute
            aria: ARIA XML string

        Returns:
            StepResponse with tool calls
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            service = Service(session)
            return service.execute_step(goal=goal, step=step, aria=aria)
        except ValueError:
            raise
        except Exception as e:
            raise Exception(f"Failed to execute step: {str(e)}")

    def verify_statement(
        self,
        session_id: str,
        statement: str,
        aria: str,
        url: Optional[str] = None,
        title: Optional[str] = None,
        screenshot: Optional[str] = None,
    ) -> VerificationResponse:
        """
        Verify a statement about the current page.

        Args:
            session_id: The session ID
            statement: The statement to verify
            aria: ARIA XML string
            url: Current URL (optional)
            title: Page title (optional)
            screenshot: Base64 encoded screenshot (optional)

        Returns:
            VerificationResponse with verification result
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            service = Service(session)
            return service.verify_statement(
                statement=statement,
                aria=aria,
                url=url,
                title=title,
                screenshot=screenshot,
            )
        except ValueError:
            raise
        except Exception as e:
            raise Exception(f"Failed to verify statement: {str(e)}")

    def extract_data(
        self,
        session_id: str,
        data_schema: Dict[str, Any],
        aria: str,
        url: Optional[str] = None,
        title: Optional[str] = None,
        screenshot: Optional[str] = None,
    ) -> DataResponse:
        """
        Extract data from the current page according to a schema.

        Args:
            session_id: The session ID
            data_schema: Schema defining what data to extract
            aria: ARIA XML string
            url: Current URL (optional)
            title: Page title (optional)
            screenshot: Base64 encoded screenshot (optional)

        Returns:
            DataResponse with extracted data
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            service = Service(session)
            # Extract the description from the data_schema and pass it as data
            data = data_schema.get("description", str(data_schema))
            return service.extract_data(
                data=data,
                aria=aria,
                url=url,
                title=title,
                screenshot=screenshot,
            )
        except ValueError:
            raise
        except Exception as e:
            raise Exception(f"Failed to extract data: {str(e)}")

    def learn(
        self,
        session_id: str,
        goal: str,
        actions: List[str],
    ) -> None:
        """
        Add a learning example to the planner agent.

        Args:
            session_id: The session ID
            goal: The goal to achieve
            actions: List of actions to achieve the goal

        Raises:
            ValueError: If the session is not found
            Exception: If learning fails
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            service = Service(session)
            service.learn(goal=goal, actions=actions)
        except ValueError:
            raise
        except Exception as e:
            raise Exception(f"Failed to learn: {str(e)}")

    def clear_examples(
        self,
        session_id: str,
    ) -> None:
        """
        Clear all learning examples from the planner agent.

        Args:
            session_id: The session ID
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            service = Service(session)
            service.clear_examples()
        except ValueError:
            raise
        except Exception as e:
            raise Exception(f"Failed to clear examples: {str(e)}")

    def save_cache(self, session_id: str) -> None:
        """
        Save the cache for a session.

        Args:
            session_id: The session ID
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            service = Service(session)
            service.save_cache()
        except ValueError:
            raise
        except Exception as e:
            raise Exception(f"Failed to save cache: {str(e)}")

    def discard_cache(self, session_id: str) -> None:
        """
        Discard the cache for a session.

        Args:
            session_id: The session ID
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")

            service = Service(session)
            service.discard_cache()
        except ValueError:
            raise
        except Exception as e:
            raise Exception(f"Failed to discard cache: {str(e)}")


# Convenience function to create a server client
def create_server_adapter() -> ServerAdapter:
    """
    Create a new server client instance.

    Returns:
        ServerClient instance
    """
    return ServerAdapter()
