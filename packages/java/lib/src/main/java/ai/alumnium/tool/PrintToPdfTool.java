package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

@ToolDescription("Print the current page to a PDF file.")
public record PrintToPdfTool(@ToolField(description = "Path to save the PDF file to") String filepath) implements BaseTool {
    @Override
    public void invoke(BaseDriver driver) {
        driver.printToPdf(filepath);
    }
    
}
