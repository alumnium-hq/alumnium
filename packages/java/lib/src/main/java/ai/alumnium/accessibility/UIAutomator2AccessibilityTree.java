package ai.alumnium.accessibility;

import java.io.StringReader;
import java.util.regex.Pattern;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

/**
 * UIAutomator2 page source rendered with stable {@code raw_id} identifiers.
 */
public final class UIAutomator2AccessibilityTree extends BaseAccessibilityTree {

    private static final Pattern XML_DECL = Pattern.compile("^\\s*<\\?xml.*\\?>\\s*$");

    private final String xmlString;
    private int nextRawId = 0;
    private String raw;

    public UIAutomator2AccessibilityTree(String xmlString) {
        StringBuilder cleaned = new StringBuilder();
        if (xmlString != null) {
            for (String line : xmlString.split("\\r?\\n")) {
                if (!XML_DECL.matcher(line).matches()) {
                    cleaned.append(line).append('\n');
                }
            }
        }
        this.xmlString = "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n <root>\n"
            + cleaned.toString() + "\n</root>";
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
        String cls = match.getAttribute("class");
        return new AccessibilityElement()
            .id(rawId)
            .type((cls == null || cls.isEmpty()) ? match.getTagName() : cls)
            .androidResourceId(nullIfEmpty(match.getAttribute("resource-id")))
            .androidText(nullIfEmpty(match.getAttribute("text")))
            .androidContentDesc(nullIfEmpty(match.getAttribute("content-desc")))
            .androidBounds(nullIfEmpty(match.getAttribute("bounds")));
    }

    @Override
    public UIAutomator2AccessibilityTree scopeToArea(int rawId) {
        String xml = toStr();
        Document doc = parse(xml);
        Element match = ChromiumAccessibilityTree.findByRawId(doc.getDocumentElement(), Integer.toString(rawId));
        if (match == null) return this;
        return new UIAutomator2AccessibilityTree(ChromiumAccessibilityTree.serialize(match));
    }

    private static Document parse(String xml) {
        try {
            return ChromiumAccessibilityTree.newBuilder().parse(new InputSource(new StringReader(xml)));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to parse UIAutomator2 XML", e);
        }
    }

    private static String nullIfEmpty(String s) {
        return (s == null || s.isEmpty()) ? null : s;
    }
}
