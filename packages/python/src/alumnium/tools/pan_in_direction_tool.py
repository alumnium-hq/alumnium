from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver
from alumnium.drivers.scroll_area import ScrollDirection

from .base_tool import BaseTool


class PanInDirectionTool(BaseTool):
    """Pan a map or other draggable canvas by dragging it like a user. Use it for any request to pan, move or drag a map, also by a distance in pixels: each call moves the view by half of the map's visible height (or width). Don't use ScrollInDirectionTool or ExecuteJavascriptTool on maps: the mouse wheel zooms them, and scripts can't drag them. To zoom, use ZoomTool."""  # noqa: E501

    id: int = Field(description="Identifier (ID) of the map itself, not of a marker or control inside it")
    direction: ScrollDirection = Field(
        description=(
            "The direction named in the request, as it is: right for pan right, move right, drag right "
            "or pan right by dragging. Never reverse it, the tool works out the gesture."
        )
    )

    def invoke(self, driver: BaseDriver):
        driver.pan_in_direction(self.id, self.direction)
