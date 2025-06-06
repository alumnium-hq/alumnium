from pydantic import BaseModel, Field
from playwright.sync_api import Page
from selenium.webdriver.remote.webdriver import WebDriver

from alumnium.drivers import BaseDriver


class HoverTool(BaseModel):
    """Hover an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: BaseDriver):
        if isinstance(driver, Page) or isinstance(driver, WebDriver):
            driver.hover(self.id)
