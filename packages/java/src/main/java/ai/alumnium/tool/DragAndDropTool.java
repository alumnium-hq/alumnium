package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription("Drag one element onto another and drop it. Don't combine with HoverTool.")
public record DragAndDropTool(
    @ToolField(description = "Identifier (ID) of element to drag") int fromId,
    @ToolField(description = "Identifier (ID) of element to drop onto") int toId)
    implements BaseTool {
  @Override
  public void invoke(BaseDriver driver) {
    driver.dragAndDrop(fromId, toId);
  }
}
