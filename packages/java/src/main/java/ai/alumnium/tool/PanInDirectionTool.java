package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.driver.ScrollDirection;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription(
    "Pan a map or other draggable canvas by dragging it like a user. Use it for"
        + " any request to pan, move or drag a map, also by a distance in pixels: each"
        + " call moves the view by half of the map's visible height (or width). Don't"
        + " use ScrollInDirectionTool or ExecuteJavascriptTool on maps: the mouse"
        + " wheel zooms them, and scripts can't drag them. To zoom, use ZoomTool.")
public record PanInDirectionTool(
    @ToolField(description = "Identifier (ID) of the map, or of any element inside it") int id,
    @ToolField(
            description =
                "The direction named in the request, as it is: right for pan right,"
                    + " move right, drag right or pan right by dragging. Never reverse it, the"
                    + " tool works out the gesture.")
        ScrollDirection direction)
    implements BaseTool {
  @Override
  public void invoke(BaseDriver driver) {
    driver.panInDirection(id, direction);
  }
}
