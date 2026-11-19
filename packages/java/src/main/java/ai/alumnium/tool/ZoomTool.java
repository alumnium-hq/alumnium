package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.driver.ZoomDirection;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription(
    "Zoom a map or other zoomable canvas in or out around its center, like a pinch. If the map has"
        + " its own zoom in/out buttons, click them instead.")
public record ZoomTool(
    @ToolField(description = "Identifier (ID) of the map, or of any element inside it") int id,
    @ToolField(description = "Zoom in to see more detail, or out to see a larger area.")
        ZoomDirection direction)
    implements BaseTool {
  @Override
  public void invoke(BaseDriver driver) {
    driver.zoom(id, direction);
  }
}
