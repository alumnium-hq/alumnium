from retry import retry

from .accessibility import BaseAccessibilityTree
from .agents import ActorAgent, PlannerAgent, RetrieverAgent
from .agents.retriever_agent import Data


class Area:
    def __init__(
        self,
        id: int,
        description: str,
        accessibility_tree: BaseAccessibilityTree,
        actor_agent: ActorAgent,
        planner_agent: PlannerAgent,
        retrieval_agent: RetrieverAgent,
    ):
        self.id = id
        self.description = description
        self.accessibility_tree = accessibility_tree
        self.actor_agent = actor_agent
        self.planner_agent = planner_agent
        self.retrieval_agent = retrieval_agent

    @retry(tries=2, delay=0.1)
    def do(self, goal: str):
        """
        Executes a series of steps to achieve the given goal within the area.

        Args:
            goal: The goal to be achieved.
        """
        steps = self.planner_agent.invoke(goal, self.accessibility_tree)
        for step in steps:
            self.actor_agent.invoke(goal, step, self.accessibility_tree)

    def check(self, statement: str, vision: bool = False) -> str:
        """
        Checks a given statement true or false within the area.

        Args:
            statement: The statement to be checked.
            vision: A flag indicating whether to use a vision-based verification via a screenshot. Defaults to False.

        Returns:
            The summary of verification result.

        Raises:
            AssertionError: If the verification fails.
        """
        result = self.retrieval_agent.invoke(
            f"Is the following true or false - {statement}",
            vision,
            self.accessibility_tree,
        )
        assert result.value, result.explanation
        return result.explanation

    def get(self, data: str, vision: bool = False) -> Data:
        """
        Extracts requested data from the area.

        Args:
            data: The data to extract.
            vision: A flag indicating whether to use a vision-based extraction via a screenshot. Defaults to False.

        Returns:
            Data: The extracted data loosely typed to int, float, str, or list of them.
        """
        return self.retrieval_agent.invoke(data, vision, self.accessibility_tree).value
