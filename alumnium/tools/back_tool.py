from alumnium.drivers import BaseDriver

from .base_tool import BaseTool


class BackTool(BaseTool):
    """Navigate back to the previous page/screen using the browser/app history.

    Use this when the user asks to:
    - Go back
    - Navigate back to the previous page
    - Return to the previous page
    - Use browser back button
    - Go to the previous screen

    This uses the browser's history navigation instead of clicking visible "Back" links or buttons.
    """

    def invoke(self, driver: BaseDriver):
        driver.back()

