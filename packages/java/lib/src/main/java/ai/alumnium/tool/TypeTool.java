package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription("Type text into an element. Automatically focuses the element and clears it before typing.")
public record TypeTool(
    @ToolField(description = "Element identifier (ID)") int id,
    @ToolField(description = "Text to type into an element") String text
) implements BaseTool {
    @Override
    public void invoke(BaseDriver driver) {
        driver.type(id, text);
    }
}