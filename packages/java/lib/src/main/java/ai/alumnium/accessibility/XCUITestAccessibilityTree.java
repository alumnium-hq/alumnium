package ai.alumnium.accessibility;

import java.io.StringReader;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

/**
 * XCUITest page source rendered with stable {@code raw_id} identifiers.
 * Mirrors
 * {@code packages/python/src/alumnium/accessibility/xcuitest_accessibility_tree.py}.
 */
public final class XCUITestAccessibilityTree extends BaseAccessibilityTree {

    private final String xmlString;
    private int nextRawId = 0;
    private String raw;

    public XCUITestAccessibilityTree(String xmlString) {
        this.xmlString = xmlString == null ? "" : xmlString;
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
        String xml = toStr();
        Document doc = parse(xml);
        Element match = ChromiumAccessibilityTree.findByRawId(doc.getDocumentElement(), Integer.toString(rawId));
        if (match == null) {
            throw new IllegalArgumentException("No element with raw_id=" + rawId + " found");
        }
        return new AccessibilityElement()
            .id(rawId)
            .type(match.getTagName())
            .name(nullIfEmpty(match.getAttribute("name")))
            .value(nullIfEmpty(match.getAttribute("value")))
            .label(nullIfEmpty(match.getAttribute("label")));
    }

    @Override
    public XCUITestAccessibilityTree scopeToArea(int rawId) {
        String xml = toStr();
        Document doc = parse(xml);
        Element match = ChromiumAccessibilityTree.findByRawId(doc.getDocumentElement(), Integer.toString(rawId));
        if (match == null) return this;
        return new XCUITestAccessibilityTree(ChromiumAccessibilityTree.serialize(match));
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
