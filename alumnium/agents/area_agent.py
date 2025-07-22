from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from alumnium.drivers import BaseDriver
from alumnium.logutils import get_logger

from .base_agent import BaseAgent

logger = get_logger(__name__)


class Area(BaseModel):
    """Area of the accessibility tree to use."""

    explanation: str = Field(
        description="Explanation how the area was determined and why it's related to the requested information. "
        + "Always include the requested information and its value in the explanation."
    )
    id: int = Field(description="Identifier of the element that corresponds to the area in the accessibility tree.")


class AreaAgent(BaseAgent):
    def __init__(self, driver: BaseDriver, llm: BaseChatModel):
        super().__init__()
        self.driver = driver
        self.chain = self._with_retry(llm.with_structured_output(Area, include_raw=True))

    def invoke(self, description: str) -> Area:
        logger.info("Starting area detection:")
        logger.info(f"  -> Description: {description}")

        accessibility_tree = self.driver.accessibility_tree
        logger.debug(f"  -> Accessibility tree: {accessibility_tree.to_xml()}")

        message = self.chain.invoke(
            [
                ("system", self.prompts["system"]),
                (
                    "human",
                    self.prompts["user"].format(
                        accessibility_tree=accessibility_tree.to_xml(), description=description
                    ),
                ),
            ]
        )

        response = message["parsed"]
        # Haiku 3 returns tool calls instead of parsed output
        if not response and message["raw"].tool_calls:
            args = message["raw"].tool_calls[0]["args"]
            if "properties" in args:
                args = args["properties"]
            if "explanation" not in args:
                args["explanation"] = "No explanation provided by the model."
            response = Area(**args)

        logger.info(f"  <- Result: {response}")
        logger.info(f"  <- Usage: {message['raw'].usage_metadata}")
        self._update_usage(message["raw"].usage_metadata)

        return {
            "id": response.id,
            "explanation": response.explanation,
            "accessibility_tree": self.driver.accessibility_tree.get_area(response.id),
        }
