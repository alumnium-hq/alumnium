from os import getenv
from typing import Any, Optional

from appium.webdriver.webdriver import WebDriver as Appium
from playwright.sync_api import Page
from retry import retry
from selenium.webdriver.remote.webdriver import WebDriver

from .drivers import AppiumDriver, PlaywrightDriver, SeleniumDriver
from .logutils import get_logger
from .models import Model
from .server_adapter import ServerAdapter
from .tools import ALL_TOOLS

logger = get_logger(__name__)


class Alumni:
    def __init__(self, driver: Page | WebDriver, model: Model = None):
        self.model = model or Model.current

        if isinstance(driver, Appium):
            self.driver = AppiumDriver(driver)
        elif isinstance(driver, Page):
            self.driver = PlaywrightDriver(driver)
        elif isinstance(driver, WebDriver):
            self.driver = SeleniumDriver(driver)
        else:
            raise NotImplementedError(f"Driver {driver} not implemented")

        logger.info(f"Using model: {self.model.provider.value}/{self.model.name}")

        # Create server client and session
        self.server_client = ServerAdapter()

        # Get environment variables for different providers
        azure_openai_api_version = getenv("AZURE_OPENAI_API_VERSION")
        aws_access_key = getenv("AWS_ACCESS_KEY")
        aws_secret_key = getenv("AWS_SECRET_KEY")
        aws_region_name = getenv("AWS_REGION_NAME", "us-east-1")

        # Create session
        self.session_id = self.server_client.create_session(
            provider=self.model.provider.value,
            name=self.model.name,
            azure_openai_api_version=azure_openai_api_version,
            aws_access_key=aws_access_key,
            aws_secret_key=aws_secret_key,
            aws_region_name=aws_region_name,
        )

    def quit(self):
        if hasattr(self, "session_id"):
            self.server_client.delete_session(self.session_id)
        self.driver.quit()

    @retry(tries=2, delay=0.1)
    def do(self, goal: str):
        """
        Executes a series of steps to achieve the given goal.

        Args:
            goal: The goal to be achieved.
        """
        aria = self._get_aria_xml()
        url = self._get_current_url()
        title = self._get_current_title()

        # Plan actions
        action_response = self.server_client.plan_actions(
            session_id=self.session_id, goal=goal, aria=aria, url=url, title=title
        )

        # Execute each action
        for action in action_response.actions:
            step_response = self.server_client.execute_step(
                session_id=self.session_id,
                goal=goal,
                step=f"{action.type}: {action.args}",
                aria=aria,
            )

            # Execute tool calls
            for tool_call in step_response.tool_calls:
                self._execute_tool_call(tool_call)

    def check(self, statement: str, vision: bool = False) -> str:
        """
        Checks a given statement using the verifier.

        Args:
            statement: The statement to be checked.
            vision: A flag indicating whether to use a vision-based verification via a screenshot. Defaults to False.

        Returns:
            The summary of verification result.
        """
        aria = self._get_aria_xml()
        url = self._get_current_url()
        title = self._get_current_title()

        # Capture screenshot if vision is enabled
        screenshot = None
        if vision:
            try:
                screenshot = self.driver.screenshot
            except Exception as e:
                logger.warning(f"Failed to capture screenshot: {e}")

        verification_response = self.server_client.verify_statement(
            session_id=self.session_id,
            statement=statement,
            aria=aria,
            url=url,
            title=title,
            screenshot=screenshot,
        )

        assert verification_response.result, verification_response.explanation
        return verification_response.explanation

    def get(self, data: str, vision: bool = False) -> Any:
        """
        Extracts requested data from the page.

        Args:
            data: The data to extract.
            vision: A flag indicating whether to use a vision-based extraction via a screenshot. Defaults to False.

        Returns:
            The extracted data loosely typed to int, float, str, or list of them.
        """
        aria = self._get_aria_xml()
        url = self._get_current_url()
        title = self._get_current_title()

        # Capture screenshot if vision is enabled
        screenshot = None
        if vision:
            try:
                screenshot = self.driver.screenshot
            except Exception as e:
                logger.warning(f"Failed to capture screenshot: {e}")

        # Convert data string to schema format expected by extract_data
        data_schema = {"description": data}

        data_response = self.server_client.extract_data(
            session_id=self.session_id,
            data_schema=data_schema,
            aria=aria,
            url=url,
            title=title,
            screenshot=screenshot,
        )

        return data_response.value

    def learn(self, goal: str, actions: list[str]):
        """
        Adds a new learning example on what steps should be take to achieve the goal.

        Args:
            goal: The goal to be achieved. Use same format as in `do`.
            actions: A list of actions to achieve the goal.
        """
        self.server_client.learn(session_id=self.session_id, goal=goal, actions=actions)

    def clear_examples(self):
        """
        Clears all learning examples from the planner agent.
        """
        self.server_client.clear_examples(session_id=self.session_id)

    def save_cache(self):
        """
        Saves the cache for the session.
        """
        self.server_client.save_cache(session_id=self.session_id)

    def discard_cache(self):
        """
        Discards the cache for the session.
        """
        self.server_client.discard_cache(session_id=self.session_id)

    def stats(self) -> dict[str, int]:
        """
        Provides statistics about the usage of tokens.

        Returns:
            A dictionary containing the number of input tokens, output tokens, and total tokens used by all agents.
        """
        try:
            session_stats = self.server_client.get_session_stats(self.session_id)
            return {
                "input_tokens": session_stats.get("input_tokens", 0),
                "output_tokens": session_stats.get("output_tokens", 0),
                "total_tokens": session_stats.get("total_tokens", 0),
            }
        except Exception as e:
            logger.warning(f"Failed to get session stats: {e}")
            return {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
            }

    def _get_aria_xml(self) -> str:
        """Get the current page's ARIA XML representation."""
        return self.driver.accessibility_tree.to_xml()

    def _get_current_url(self) -> Optional[str]:
        """Get the current page URL."""
        try:
            return self.driver.url
        except Exception:
            return None

    def _get_current_title(self) -> Optional[str]:
        """Get the current page title."""
        try:
            return self.driver.title
        except Exception:
            return None

    def _execute_tool_call(self, tool_call):
        """Execute a tool call on the driver."""

        # Create tool instance from ALL_TOOLS
        tool = ALL_TOOLS[tool_call.name](**tool_call.args)

        # Resolve element IDs using accessibility tree
        accessibility_tree = self.driver.accessibility_tree
        if "id" in tool.model_fields_set:
            tool.id = accessibility_tree.element_by_id(tool.id).id
        if "from_id" in tool.model_fields_set:
            tool.from_id = accessibility_tree.element_by_id(tool.from_id).id
        if "to_id" in tool.model_fields_set:
            tool.to_id = accessibility_tree.element_by_id(tool.to_id).id

        # Invoke the tool
        tool.invoke(self.driver)
