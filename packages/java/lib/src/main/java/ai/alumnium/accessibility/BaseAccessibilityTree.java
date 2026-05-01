package ai.alumnium.accessibility;

/**
 * Common surface for the three accessibility-tree representations. 
 */
public abstract class BaseAccessibilityTree {

    /** Full serialised tree as XML; the server consumes this verbatim. */
    public abstract String toStr();

    /**
     * Resolves an element descriptor by its positional {@code raw_id}
     * attribute (assigned as the tree is built).
     */
    public abstract AccessibilityElement elementById(int rawId);

    /**
     * Returns a new tree narrowed to the subtree rooted at {@code rawId}.
     * Returns {@code this} when no matching element is found (matches the
     * Python behaviour).
     */
    public abstract BaseAccessibilityTree scopeToArea(int rawId);
}
