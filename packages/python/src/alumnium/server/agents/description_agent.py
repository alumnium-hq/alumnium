from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from ..logutils import get_logger
from .base_agent import BaseAgent

logger = get_logger(__name__)


class PageDescription(BaseModel):
    """Structured description of page state."""

    page_overview: str = Field(description="Brief overview of page purpose and context")
    main_structure: str = Field(description="Key semantic sections and layout")
    interactive_elements: str = Field(description="Important buttons, links, inputs")
    navigation_options: str = Field(description="Available navigation paths")
    notable_state: str = Field(description="Errors, loading states, modals, etc.")
    action_opportunities: list[str] = Field(description="High-level actions possible")


class DescriptionAgent(BaseAgent):
    def __init__(self, llm: BaseChatModel):
        super().__init__()

        self.chain = llm.with_structured_output(
            PageDescription,
            include_raw=True,
        )

    def invoke(
        self,
        accessibility_tree_xml: str,
        title: str = "",
        url: str = "",
        screenshot: str = None,
    ) -> str:
        logger.info("Starting page description:")
        logger.debug(f"  -> Accessibility tree: {accessibility_tree_xml}")
        logger.debug(f"  -> Title: {title}")
        logger.debug(f"  -> URL: {url}")
        logger.debug(f"  -> Vision: {screenshot is not None}")

        prompt = ""
        if not screenshot:
            prompt += self.prompts["_user_text"].format(
                accessibility_tree=accessibility_tree_xml, title=title, url=url
            )

        human_messages = [{"type": "text", "text": prompt}]

        if screenshot:
            human_messages.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{screenshot}",
                    },
                }
            )

        message = self._invoke_chain(
            self.chain,
            [
                ("system", self.prompts["system"]),
                ("human", human_messages),
            ],
        )

        response = message["parsed"]

        logger.info("  <- Description completed")
        logger.info(f"  <- Usage: {message['raw'].usage_metadata}")

        # Convert to markdown
        markdown = self._format_as_markdown(response)
        return markdown

    def _format_as_markdown(self, result: PageDescription) -> str:
        """Convert structured result to markdown format."""
        sections = []

        sections.append("# Page Description\n")

        if result.page_overview:
            sections.append(f"## Overview\n{result.page_overview}\n")

        if result.main_structure:
            sections.append(f"## Structure\n{result.main_structure}\n")

        if result.interactive_elements:
            sections.append(f"## Interactive Elements\n{result.interactive_elements}\n")

        if result.navigation_options:
            sections.append(f"## Navigation\n{result.navigation_options}\n")

        if result.notable_state:
            sections.append(f"## Notable State\n{result.notable_state}\n")

        if result.action_opportunities:
            sections.append("## Possible Actions\n")
            for action in result.action_opportunities:
                sections.append(f"- {action}\n")

        return "\n".join(sections)
