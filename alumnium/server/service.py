import base64
from typing import Optional

from alumnium.logutils import get_logger
from .models import (
    Action,
    ActionResponse,
    DataResponse,
    VerificationResponse,
    StepResponse,
    ToolCall,
)
from .session_manager import Session

logger = get_logger(__name__)


class Service:
    """Service layer for handling Alumnium operations."""

    def __init__(self, session: Session):
        self.session = session

    def plan_actions(
        self,
        goal: str,
        aria: str,
        url: Optional[str] = None,
        title: Optional[str] = None,
    ) -> ActionResponse:
        """Plan actions to achieve a goal."""
        logger.info(f"Planning actions for goal: {goal}")

        # Get the planned steps directly using the provided ARIA XML
        steps = self.session.planner_agent.invoke(goal, accessibility_tree_xml=aria)

        # Convert steps to actions
        actions = []
        for step in steps:
            # Get the tool calls for this step using the new actor agent
            tool_calls = self.session.actor_agent.invoke(goal, step, aria)

            # Convert tool calls to actions
            for tool_call in tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]

                # Map tool names to action types
                action_type = self._map_tool_to_action_type(tool_name)

                actions.append(Action(type=action_type, args=tool_args))

        return ActionResponse(actions=actions)

    def execute_step(
        self,
        goal: str,
        step: str,
        aria: str,
    ) -> StepResponse:
        """Execute a single step using the actor agent."""
        logger.info(f"Executing step for goal: {goal}")
        logger.info(f"Step: {step}")

        # Get the tool calls for this step using the actor agent
        tool_calls = self.session.actor_agent.invoke(goal, step, aria)

        # If tool_calls is None (empty step), return an empty StepResponse
        if tool_calls is None:
            return StepResponse(tool_calls=[])

        # Convert tool calls to ToolCall objects
        tool_call_objects = []
        for tool_call in tool_calls:
            tool_call_objects.append(ToolCall(name=tool_call["name"], args=tool_call["args"]))

        return StepResponse(tool_calls=tool_call_objects)

    def verify_statement(
        self,
        statement: str,
        aria: str,
        screenshot: Optional[str] = None,
        url: Optional[str] = None,
        title: Optional[str] = None,
    ) -> VerificationResponse:
        """Verify a statement about the page."""
        logger.info(f"Verifying statement: {statement}")

        # Determine if we should use vision
        vision = screenshot is not None

        # If screenshot is provided, validate it
        if screenshot:
            try:
                # Validate base64
                base64.b64decode(screenshot)
            except Exception as e:
                logger.error(f"Invalid base64 screenshot: {e}")
                raise ValueError("Invalid base64 encoded screenshot")

        # Perform the verification using the new retriever agent
        result = self.session.retriever_agent.invoke(
            f"Is the following true or false - {statement}",
            vision,
            aria,
            title or "",
            url or "",
            screenshot,
        )

        # Convert the result to boolean
        if isinstance(result.value, bool):
            is_true = result.value
        elif isinstance(result.value, str):
            is_true = result.value.lower() in ["true", "yes", "1", "correct"]
        else:
            is_true = bool(result.value)

        return VerificationResponse(result=is_true, explanation=result.explanation)

    def extract_data(
        self,
        data: str,
        aria: str,
        screenshot: Optional[str] = None,
        url: Optional[str] = None,
        title: Optional[str] = None,
    ) -> DataResponse:
        """Extract data from the page."""
        logger.info(f"Extracting data: {data}")

        # Determine if we should use vision
        vision = screenshot is not None

        # If screenshot is provided, validate it
        if screenshot:
            try:
                # Validate base64
                base64.b64decode(screenshot)
            except Exception as e:
                logger.error(f"Invalid base64 screenshot: {e}")
                raise ValueError("Invalid base64 encoded screenshot")

        # Extract the data using the new retriever agent
        result = self.session.retriever_agent.invoke(data, vision, aria, title or "", url or "", screenshot)

        return DataResponse(value=result.value, explanation=result.explanation)

    def learn(self, goal: str, actions: list[str]) -> None:
        """Add a learning example to the planner agent."""
        logger.info(f"Learning new example for goal: {goal}")
        logger.info(f"Actions: {actions}")

        self.session.planner_agent.add_example(goal, actions)

    def clear_examples(self) -> None:
        """Clear all learning examples from the planner agent."""
        logger.info("Clearing all learning examples")
        self.session.planner_agent.prompt_with_examples.examples.clear()

    def save_cache(self) -> None:
        """Save the cache for the session."""
        logger.info("Saving cache")
        self.session.cache.save()

    def discard_cache(self) -> None:
        """Discard the cache for the session."""
        logger.info("Discarding cache")
        self.session.cache.discard()

    def _map_tool_to_action_type(self, tool_name: str) -> str:
        """Map tool names to action types."""
        tool_mapping = {
            "ClickTool": "click",
            "TypeTool": "type",
            "SelectTool": "select",
            "HoverTool": "hover",
            "PressKeyTool": "press_key",
            "DragAndDropTool": "drag_and_drop",
        }

        return tool_mapping.get(tool_name, tool_name.lower().replace("tool", ""))
