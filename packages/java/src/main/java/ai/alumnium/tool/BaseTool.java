package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;
import ai.alumnium.result.DoStep;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Sealed root of the tool hierarchy. Each permitted subtype is a Java {@code record} describing one
 * action the server can ask the driver to perform.
 *
 * <p>The static {@link #executeToolCall(DoStep, Map, BaseDriver)} helper takes a {@link
 * ai.alumnium.result.DoStep} deserialized from {@code {"name","args"}}, binds {@code args} to the
 * concrete tool record, and invokes it.
 */
public sealed interface BaseTool
    permits ClickTool,
        PressKeyTool,
        TypeTool,
        DragAndDropTool,
        DragSliderTool,
        ExecuteJavascriptTool,
        HoverTool,
        NavigateBackTool,
        NavigateToUrlTool,
        PrintToPdfTool,
        ScrollTool,
        SwitchToNextTabTool,
        SwitchToPreviousTabTool,
        UploadTool {

  /** Run the tool against the given driver. */
  void invoke(BaseDriver driver);

  ObjectMapper MAPPER = new ObjectMapper();

  /**
   * Instantiate a tool from its JSON representation and execute it. Returns the {@code
   * ToolName(arg=value, ...)} string representation, matching the Python {@code
   * BaseTool.execute_tool_call} contract.
   */
  static String executeToolCall(
      DoStep toolCall, Map<String, Class<? extends BaseTool>> tools, BaseDriver driver) {
    String toolName = toolCall.name();
    Map<String, Object> toolArgs = toolCall.args();
    Class<? extends BaseTool> toolClass = tools.get(toolName);
    if (toolClass == null) {
      throw new IllegalArgumentException("Unknown tool: " + toolName);
    }
    BaseTool tool = MAPPER.convertValue(toolArgs, toolClass);
    tool.invoke(driver);

    StringJoiner joiner = new StringJoiner(", ");
    for (Map.Entry<String, Object> e : toolArgs.entrySet()) {
      joiner.add(e.getKey() + "='" + e.getValue() + "'");
    }
    return toolName + "(" + joiner + ")";
  }
}
