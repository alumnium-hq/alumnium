package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription(
    "Click an element. If the target element is a dropdown and is already expanded - you"
        + " don't need to click it. NEVER use ClickTool to upload files - use UploadTool"
        + " instead.")
public record ClickTool(@ToolField(description = "Element identifier (ID)") int id)
    implements BaseTool {
  @Override
  public void invoke(BaseDriver driver) {
    driver.click(id);
  }
}
