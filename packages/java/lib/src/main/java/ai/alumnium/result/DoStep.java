package ai.alumnium.result;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

/**
 * Either (1) a planner step outcome with stringified tools, or (2) one server
 * {@code POST .../steps} tool invocation deserialized from {@code {"name","args"}}.
 *
 * @param name  planner-step text for executed results; tool simple name when from the server
 * @param tools stringified tool invocations after {@link ai.alumnium.tool.BaseTool#executeToolCall}
 * @param args  tool arguments from the server; empty once merged into executed {@code steps}
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DoStep(String name, List<String> tools, Map<String, Object> args) {

    /** Executed planner step ({@link ai.alumnium.Alumni#executeDo}). */
    public DoStep(String name, List<String> tools) {
        this(name, tools, Map.of());
    }

    public DoStep {
        tools = tools == null ? List.of() : List.copyOf(tools);
        args = args == null ? Map.of() : Map.copyOf(args);
    }
}
