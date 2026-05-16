package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;

@ToolDescription(
"""
    Navigate back to the previous page/screen using the browser/app history.

    Use this when the user asks to:
    - Go back
    - Navigate back to the previous page
    - Return to the previous page
    - Use browser back button
    - Go to the previous screen

    This uses the browser's history navigation instead of clicking visible "Back" links or buttons.
""")
public record NavigateBackTool() implements BaseTool {
  @Override
  public void invoke(BaseDriver driver) {
    driver.back();
  }
}
