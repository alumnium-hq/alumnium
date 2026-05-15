package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription("Scroll to an element.")
public record ScrollTool(@ToolField(description = "Element identifier (ID)") int id) implements BaseTool {
    @Override
    public void invoke(BaseDriver driver) {
        driver.scrollTo(id);
    }
    
}
