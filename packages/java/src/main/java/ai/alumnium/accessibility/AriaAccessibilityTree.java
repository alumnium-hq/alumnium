package ai.alumnium.accessibility;

import java.util.List;
import java.util.Map;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * Accessibility tree built from an ARIA snapshot computed in the page (e.g. by acquiescence's
 * {@code AriaSnapshotGenerator}), with elements addressed by their WebDriver BiDi shared IDs.
 *
 * <p>Snapshot nodes mirror acquiescence's {@code AriaNode}:
 * https://github.com/jimevans/acquiescence/blob/main/src/ariaSnapshotGenerator.ts
 */
public final class AriaAccessibilityTree extends BaseAccessibilityTree {

  private static final List<String> STATE_ATTRS =
      List.of(
          "checked", "disabled", "expanded", "level", "pressed", "selected", "url", "placeholder");

  private final Map<String, Object> root;

  /** Snapshot ref -> WebDriver BiDi shared ID of its element. */
  private final Map<String, String> sharedIds;

  /** Snapshot ref -> value the snapshot leaves out, e.g. chosen files. */
  private final Map<String, String> values;

  private int nextRawId = 0;
  private String raw;

  public AriaAccessibilityTree(
      Map<String, Object> root, Map<String, String> sharedIds, Map<String, String> values) {
    this.root = root;
    this.sharedIds = sharedIds == null ? Map.of() : sharedIds;
    this.values = values == null ? Map.of() : values;
  }

  /** Factory that skips building by reusing a pre-computed XML string. */
  static AriaAccessibilityTree fromXml(String xml) {
    AriaAccessibilityTree t = new AriaAccessibilityTree(null, null, null);
    t.raw = xml == null ? "" : xml;
    return t;
  }

  @Override
  public String toStr() {
    if (raw != null) return raw;

    if (root == null) {
      raw = "";
      return raw;
    }

    Document doc = ChromiumAccessibilityTree.newDocument();
    raw = ChromiumAccessibilityTree.serialize(nodeToXml(doc, root)).trim();
    return raw;
  }

  private Element nodeToXml(Document doc, Map<String, Object> node) {
    String role = String.valueOf(node.get("role"));
    Element elem = element(doc, "fragment".equals(role) ? "RootWebArea" : role);

    Object ref = node.get("ref");
    String sharedId = ref == null ? null : sharedIds.get(ref.toString());
    if (sharedId != null && !sharedId.isEmpty()) {
      elem.setAttribute("sharedId", sharedId);
    }
    Object name = node.get("name");
    if (name != null && !name.toString().isEmpty()) {
      elem.setAttribute("name", name.toString());
    }
    String value = ref == null ? null : values.get(ref.toString());
    if (value != null && !value.isEmpty()) {
      elem.setAttribute("value", value);
    }
    for (String attr : STATE_ATTRS) {
      Object state = node.get(attr);
      if (state != null) {
        elem.setAttribute(attr, toStr(state));
      }
    }

    Object children = node.get("children");
    if (children instanceof List<?> list) {
      for (Object child : list) {
        if (child instanceof Map<?, ?> childNode) {
          @SuppressWarnings("unchecked")
          Map<String, Object> typed = (Map<String, Object>) childNode;
          elem.appendChild(nodeToXml(doc, typed));
        } else if (child != null) {
          Element text = element(doc, "text");
          text.setAttribute("name", child.toString());
          elem.appendChild(text);
        }
      }
    }
    return elem;
  }

  private Element element(Document doc, String role) {
    nextRawId++;
    Element elem = doc.createElement(ChromiumAccessibilityTree.sanitizeTag(role));
    elem.setAttribute("raw_id", Integer.toString(nextRawId));
    return elem;
  }

  @Override
  public AccessibilityElement elementById(int rawId) {
    Element match = findByRawId(rawId);
    if (match == null) {
      throw new IllegalArgumentException("No element with raw_id=" + rawId + " found");
    }

    String sharedId = match.getAttribute("sharedId");
    if (sharedId.isEmpty()) {
      throw new IllegalStateException(
          "Element with raw_id=" + rawId + " has no sharedId attribute");
    }
    return new AccessibilityElement().type(match.getTagName()).sharedId(sharedId);
  }

  @Override
  public AriaAccessibilityTree scopeToArea(int rawId) {
    Element match = findByRawId(rawId);
    if (match == null) {
      return this;
    }
    stripWhitespace(match);
    return fromXml(ChromiumAccessibilityTree.serialize(match).trim());
  }

  /** Drops indentation left from parsing, so the subtree is indented afresh. */
  private static void stripWhitespace(Node node) {
    NodeList children = node.getChildNodes();
    for (int i = children.getLength() - 1; i >= 0; i--) {
      Node child = children.item(i);
      if (child.getNodeType() == Node.TEXT_NODE && child.getTextContent().isBlank()) {
        node.removeChild(child);
      } else {
        stripWhitespace(child);
      }
    }
  }

  private Element findByRawId(int rawId) {
    Document doc = ChromiumAccessibilityTree.parseWrapped(toStr());
    return ChromiumAccessibilityTree.findByRawId(doc.getDocumentElement(), Integer.toString(rawId));
  }

  private static String toStr(Object value) {
    if (value instanceof Boolean b) return b ? "true" : "false";
    if (value instanceof Double d && d == Math.rint(d)) return Long.toString(d.longValue());
    return value.toString();
  }
}
