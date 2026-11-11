package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.driver.ScrollDirection;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription(
    "Scroll a scrollable area (page, list, panel, chat thread) in a direction by most of its"
        + " visible height (or width), like a mouse wheel. Use it to reveal content above or below"
        + " the visible part of the area. To bring a specific element into view, use ScrollTool"
        + " instead.")
public record ScrollInDirectionTool(
    @ToolField(description = "Identifier (ID) of the scrollable area, or of any element inside it")
        int id,
    @ToolField(description = "Direction to scroll the content.") ScrollDirection direction)
    implements BaseTool {
  @Override
  public void invoke(BaseDriver driver) {
    driver.scrollInDirection(id, direction);
  }
}
