package ai.alumnium.accessibility;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Plain-data record shapes used when building synthetic accessibility nodes
 * for cross-origin iframes. 
 */
public final class ChromiumNodeTypes {

    private ChromiumNodeTypes() {}

    /** Selector + nth pair used to relocate an element at action time. */
    public record ChromiumLocatorInfo(String selector, int nth) {
        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("selector", selector);
            m.put("nth", nth);
            return m;
        }
    }

    /**
     * Mutable builder for the small dict-shaped synthetic nodes the drivers
     * push into the aggregated accessibility payload. We keep this as a
     * bag of {@code Map}s rather than a record because the Chromium tree
     * consumes it via the same JSON-ish shape as the real CDP nodes.
     */
    public static Map<String, Object> syntheticNode(String nodeId,
                                                    String role,
                                                    String name,
                                                    ChromiumLocatorInfo locator) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("nodeId", nodeId);
        node.put("role", Map.of("value", role));
        node.put("name", Map.of("value", name == null ? "" : name));
        node.put("_playwright_node", Boolean.TRUE);
        if (locator != null) {
            node.put("_locator_info", locator.toMap());
        }
        return node;
    }
}
