package ai.alumnium.accessibility;

import java.io.StringReader;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

/**
 * XCUITest page source rendered with stable {@code raw_id} identifiers. Mirrors {@code
 * packages/python/src/alumnium/accessibility/xcuitest_accessibility_tree.py}.
 */
public final class XCUITestAccessibilityTree extends BaseAccessibilityTree {

  private final String xmlString;
  private int nextRawId = 0;
  private String raw;
  private final XCUITestAccessibilityTree fullTree;

  public XCUITestAccessibilityTree(String xmlString) {
    this(xmlString, null);
  }

  /**
   * @param xmlString XCUITest page source
   * @param fullTree full tree this one was scoped from. When present, the XML already carries
   *     {@code raw_id} attributes and lookups are delegated to the full tree so that element
   *     indexes are relative to the whole app.
   */
  private XCUITestAccessibilityTree(String xmlString, XCUITestAccessibilityTree fullTree) {
    this.xmlString = xmlString == null ? "" : xmlString;
    this.fullTree = fullTree;
    if (fullTree != null) {
      this.raw = this.xmlString;
    }
  }

  @Override
  public String toStr() {
    if (raw != null) return raw;
    Document doc = parse(xmlString);
    addRawIds(doc.getDocumentElement());
    raw = ChromiumAccessibilityTree.serialize(doc.getDocumentElement());
    return raw;
  }

  private void addRawIds(Element elem) {
    nextRawId++;
    elem.setAttribute("raw_id", Integer.toString(nextRawId));
    NodeList kids = elem.getChildNodes();
    for (int i = 0; i < kids.getLength(); i++) {
      Node n = kids.item(i);
      if (n instanceof Element ce) {
        addRawIds(ce);
      }
    }
  }

  @Override
  public AccessibilityElement elementById(int rawId) {
    if (fullTree != null) {
      return fullTree.elementById(rawId);
    }
    String xml = toStr();
    Document doc = parse(xml);
    Element match =
        ChromiumAccessibilityTree.findByRawId(doc.getDocumentElement(), Integer.toString(rawId));
    if (match == null) {
      throw new IllegalArgumentException("No element with raw_id=" + rawId + " found");
    }
    return new AccessibilityElement()
        .id(rawId)
        .type(match.getTagName())
        .name(nullIfEmpty(match.getAttribute("name")))
        .value(nullIfEmpty(match.getAttribute("value")))
        .label(nullIfEmpty(match.getAttribute("label")))
        .index(predicateIndex(doc, match));
  }

  /**
   * Position of the element among all elements matching the same iOS predicate (type plus non-empty
   * name, value and label) in document order.
   */
  private static int predicateIndex(Document doc, Element element) {
    String[] attrs = {"name", "value", "label"};
    NodeList candidates = doc.getElementsByTagName(element.getTagName());
    int index = 0;
    for (int i = 0; i < candidates.getLength(); i++) {
      Element candidate = (Element) candidates.item(i);
      if (candidate == element) break;
      boolean matches = true;
      for (String attr : attrs) {
        String value = element.getAttribute(attr);
        if (!value.isEmpty() && !value.equals(candidate.getAttribute(attr))) {
          matches = false;
          break;
        }
      }
      if (matches) index++;
    }
    return index;
  }

  @Override
  public XCUITestAccessibilityTree scopeToArea(int rawId) {
    String xml = toStr();
    Document doc = parse(xml);
    Element match =
        ChromiumAccessibilityTree.findByRawId(doc.getDocumentElement(), Integer.toString(rawId));
    if (match == null) return this;
    return new XCUITestAccessibilityTree(
        ChromiumAccessibilityTree.serialize(match), fullTree != null ? fullTree : this);
  }

  private static Document parse(String xml) {
    try {
      return ChromiumAccessibilityTree.newBuilder().parse(new InputSource(new StringReader(xml)));
    } catch (Exception e) {
      throw new IllegalStateException("Failed to parse XCUITest XML", e);
    }
  }

  private static String nullIfEmpty(String s) {
    return (s == null || s.isEmpty()) ? null : s;
  }
}
