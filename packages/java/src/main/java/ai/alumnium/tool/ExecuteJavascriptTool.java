package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription("Execute a JavaScript snippet in the browser context.")
public record ExecuteJavascriptTool(
    @ToolField(description = "JavaScript code to execute") String script) implements BaseTool {
  @Override
  public void invoke(BaseDriver driver) {
    driver.executeScript(script);
  }
}
