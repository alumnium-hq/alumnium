from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class NavigateToUrlTool(BaseTool):
    """Navigate to a user provided url.

    Use this when the user asks to:
    - Open 
    - Go to
    - Navigate to this page
    - Visit this page
    """

    url: str = Field(description="Provided url (str)")
    
    def invoke(self, driver: BaseDriver):
        driver.visit(self.url)
