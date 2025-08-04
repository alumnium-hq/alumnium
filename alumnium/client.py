from alumnium.tools.base_tool import BaseTool
from .models import Model
from .session import SessionManager


class Client:
    def __init__(self, model: Model, tools: dict[str, BaseTool]):
        self.session_manager = SessionManager()
        self.model = model
        self.tools = tools

        # Create session
        self.session_id = self.session_manager.create_session(
            provider=self.model.provider, name=self.model.name, tools=self.tools
        )

        self.session = self.session_manager.get_session(self.session_id)
        self.planner_agent = self.session.planner_agent
        self.actor_agent = self.session.actor_agent
        self.retriever_agent = self.session.retriever_agent
        self.area_agent = self.session.area_agent
        self.cache = self.session.cache

    def quit(self):
        self.session_manager.delete_session(self.session_id)
