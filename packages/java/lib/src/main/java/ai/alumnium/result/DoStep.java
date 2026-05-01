package ai.alumnium.result;

import java.util.List;

/**
 * A single step in a {@code Alumni.doGoal} execution. 
 *
 * @param name  the human-readable step description as returned by the planner
 * @param tools the stringified tool invocations executed for this step
 */
public record DoStep(String name, List<String> tools) {
    public DoStep {
        tools = tools == null ? List.of() : List.copyOf(tools);
    }
}
