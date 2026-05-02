package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.driver.Key;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription("Press a keyboard key. Does not require element to be focused.")
public record PressKeyTool(
    @ToolField(description = "Key to press.") Key key
) implements BaseTool {
    @Override
    public void invoke(BaseDriver driver) {
        driver.pressKey(key);
    }
}