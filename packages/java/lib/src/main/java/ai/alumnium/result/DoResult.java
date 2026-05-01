package ai.alumnium.result;

import java.util.List;

/**
 * Result of executing {@code Alumni.doGoal}. 
 */
public record DoResult(String explanation, List<DoStep> steps, String changes) {
    public DoResult {
        steps = steps == null ? List.of() : List.copyOf(steps);
        changes = changes == null ? "" : changes;
    }

    public DoResult(String explanation, List<DoStep> steps) {
        this(explanation, steps, "");
    }
}
