package ai.alumnium.tool;

import ai.alumnium.driver.BaseDriver;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.StringJoiner;

/**
 * Sealed root of the tool hierarchy. Each permitted subtype is a Java
 * {@code record} describing one action the server can ask the driver to
 * perform. 
 *
 * <p>The static {@link #executeToolCall(Map, Map, BaseDriver)} helper
 * deserialises a {@code {"name": "...", "args": {...}}} payload into the
 * appropriate record using Jackson and invokes it against the driver.
 */
public sealed interface BaseTool
    permits ClickTool {

    /** Run the tool against the given driver. */
    void invoke(BaseDriver driver);

    ObjectMapper MAPPER = new ObjectMapper();

    /**
     * Instantiate a tool from its JSON representation and execute it. Returns
     * the {@code ToolName(arg=value, ...)} string representation, matching the
     * Python {@code BaseTool.execute_tool_call} contract.
     */
    static String executeToolCall(Map<String, Object> toolCall,
                                  Map<String, Class<? extends BaseTool>> tools,
                                  BaseDriver driver) {
        String toolName = String.valueOf(toolCall.getOrDefault("name", ""));
        Object rawArgs = toolCall.getOrDefault("args", Map.of());
        Class<? extends BaseTool> toolClass = tools.get(toolName);
        if (toolClass == null) {
            throw new IllegalArgumentException("Unknown tool: " + toolName);
        }
        BaseTool tool = MAPPER.convertValue(rawArgs, toolClass);
        tool.invoke(driver);

        StringJoiner args = new StringJoiner(", ");
        if (rawArgs instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> e : map.entrySet()) {
                args.add(e.getKey() + "='" + e.getValue() + "'");
            }
        }
        return toolName + "(" + args + ")";
    }
}
