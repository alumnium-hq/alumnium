from alumnium.tools.base_tool import BaseTool

from .server.models import Model
from .server.session_manager import SessionManager


class Client:
    def __init__(self, model: Model, tools: dict[str, BaseTool]):
        self.session_manager = SessionManager()
        self.model = model
        self.tools = tools

        self.session_id = self.session_manager.create_session(
            provider=self.model.provider.value, name=self.model.name, tools=self.tools
        )

        self.session = self.session_manager.get_session(self.session_id)
        self.cache = self.session.cache

    def quit(self):
        self.session_manager.delete_session(self.session_id)

    def plan_actions(self, goal: str, accessibility_tree: str):
        return self.session.planner_agent.invoke(goal, accessibility_tree)

    def add_example(self, goal: str, actions: list[str]):
        return self.session.planner_agent.add_example(goal, actions)

    def clear_examples(self):
        self.session.planner_agent.prompt_with_examples.examples.clear()

    def execute_action(self, goal: str, step: str, accessibility_tree: str):
        return self.session.actor_agent.invoke(goal, step, accessibility_tree)

    def retrieve(
        self,
        statement: str,
        accessibility_tree: str,
        title: str,
        url: str,
        screenshot: str,
    ):
        return self.session.retriever_agent.invoke(
            statement, accessibility_tree, title=title, url=url, screenshot=screenshot
        )

    def find_area(self, description: str, accessibility_tree: str):
        return self.session.area_agent.invoke(description, accessibility_tree)

    def session_stats(self):
        return self.session.stats()
