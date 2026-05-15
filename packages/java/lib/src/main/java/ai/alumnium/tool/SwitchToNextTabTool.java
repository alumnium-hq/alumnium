package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;

@ToolDescription("Switch to the next browser tab/window.")
public record SwitchToNextTabTool() implements BaseTool {
    @Override
    public void invoke(BaseDriver driver) {
        driver.switchToNextTab();
    }
    
}
