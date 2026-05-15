package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;

@ToolDescription("Switch to the previous browser tab/window.")
public record SwitchToPreviousTabTool() implements BaseTool {
    @Override
    public void invoke(BaseDriver driver) {
        driver.switchToPreviousTab();
    }
    
}
