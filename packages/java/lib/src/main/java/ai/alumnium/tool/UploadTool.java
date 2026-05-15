package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;
import java.util.List;

@ToolDescription("Upload one or more files using a button that opens a file chooser. This tool automatically clicks the button, DO NOT use ClickTool for that.")
public record UploadTool(@ToolField(description = "Element identifier (ID)") int id,
                          @ToolField(description = "Absolute file path(s) to upload. Can be a single path or multiple paths for multi-file upload.") List<String> paths) implements BaseTool {
    @Override
    public void invoke(BaseDriver driver) {
        driver.upload(id, paths);
    }
    
}
