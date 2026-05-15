package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription("Navigate to or open the URL.")
public record NavigateToUrlTool(@ToolField(description = "URL to navigate to") String url) implements BaseTool {
    @Override
    public void invoke(BaseDriver driver) {
        driver.visit(url);
    }
    
}
