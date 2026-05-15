package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription("Set slider to a desired value by clicking at the calculated position based on the slider's width and step.")
public record DragSliderTool(@ToolField(description = "Identifier (ID) of the slider element") int id,
                              @ToolField(description = "Desired value to set the slider to") double value) implements BaseTool {
    @Override
    public void invoke(BaseDriver driver) {
        driver.dragSlider(id, value);
    }
}
