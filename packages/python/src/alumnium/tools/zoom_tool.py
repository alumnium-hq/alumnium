from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver
from alumnium.drivers.map_gestures import ZoomDirection

from .base_tool import BaseTool


class ZoomTool(BaseTool):
    """Zoom a map or other zoomable canvas in or out around its center, like a pinch. If the map has its own zoom in/out buttons, click them instead."""  # noqa: E501

    id: int = Field(description="Identifier (ID) of the map, or of any element inside it")
    direction: ZoomDirection = Field(description="Zoom in to see more detail, or out to see a larger area.")

    def invoke(self, driver: BaseDriver):
        driver.zoom(self.id, self.direction)
