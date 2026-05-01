package ai.alumnium.accessibility;

import java.util.List;
import java.util.Map;

/**
 * Mutable bag of accessibility-element properties produced by the three
 * accessibility-tree flavours. 
 *
 * <p>Fields are nullable so callers can test for presence before use.
 * {@code frame} is kept as {@link Object} because Playwright's {@code Frame}
 * type is only available at runtime when the Playwright driver is on the
 * classpath (we avoid a hard compile-time dependency in this module).
 */
public final class AccessibilityElement {
    private Integer id;
    private Integer backendNodeId;
    private String name;
    private String label;
    private String type;
    private String value;
    private String androidResourceId;
    private String androidClass;
    private String androidText;
    private String androidContentDesc;
    private String androidBounds;
    private Object frame;
    private Map<String, Object> locatorInfo;
    private List<Integer> frameChain;

    public AccessibilityElement() {}

    public Integer id() { return id; }
    public AccessibilityElement id(Integer v) { this.id = v; return this; }

    public Integer backendNodeId() { return backendNodeId; }
    public AccessibilityElement backendNodeId(Integer v) { this.backendNodeId = v; return this; }

    public String name() { return name; }
    public AccessibilityElement name(String v) { this.name = v; return this; }

    public String label() { return label; }
    public AccessibilityElement label(String v) { this.label = v; return this; }

    public String type() { return type; }
    public AccessibilityElement type(String v) { this.type = v; return this; }

    public String value() { return value; }
    public AccessibilityElement value(String v) { this.value = v; return this; }

    public String androidResourceId() { return androidResourceId; }
    public AccessibilityElement androidResourceId(String v) { this.androidResourceId = v; return this; }

    public String androidClass() { return androidClass; }
    public AccessibilityElement androidClass(String v) { this.androidClass = v; return this; }

    public String androidText() { return androidText; }
    public AccessibilityElement androidText(String v) { this.androidText = v; return this; }

    public String androidContentDesc() { return androidContentDesc; }
    public AccessibilityElement androidContentDesc(String v) { this.androidContentDesc = v; return this; }

    public String androidBounds() { return androidBounds; }
    public AccessibilityElement androidBounds(String v) { this.androidBounds = v; return this; }

    public Object frame() { return frame; }
    public AccessibilityElement frame(Object v) { this.frame = v; return this; }

    public Map<String, Object> locatorInfo() { return locatorInfo; }
    public AccessibilityElement locatorInfo(Map<String, Object> v) { this.locatorInfo = v; return this; }

    public List<Integer> frameChain() { return frameChain; }
    public AccessibilityElement frameChain(List<Integer> v) { this.frameChain = v; return this; }
}
