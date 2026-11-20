from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver
from alumnium.drivers.map_gestures import ZoomDirection

from .base_tool import BaseTool


class ZoomTool(BaseTool):
    """Zoom a map or other zoomable canvas in or out around its center, like a pinch. Use it for any request to zoom by a gesture, a pinch, the mouse wheel or scrolling on the map: don't use ScrollInDirectionTool to zoom. If the map has its own zoom in/out buttons, click them instead, unless asked not to."""  # noqa: E501

    id: int = Field(description="Identifier (ID) of the map itself, not of a marker or control inside it")
    direction: ZoomDirection = Field(description="Zoom in to see more detail, or out to see a larger area.")

    def invoke(self, driver: BaseDriver):
        driver.zoom(self.id, self.direction)
