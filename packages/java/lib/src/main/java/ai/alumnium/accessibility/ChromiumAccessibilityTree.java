package ai.alumnium.accessibility;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.StringReader;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

/**
 * Chromium DevTools {@code Accessibility.getFullAXTree} payload rendered as
 * XML. 
 */
public final class ChromiumAccessibilityTree extends BaseAccessibilityTree {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final Map<String, Object> cdpResponse;
    private int nextRawId = 0;
    private String raw;
    private final Map<Integer, Object> frameMap = new HashMap<>();
    private final Map<Integer, List<Integer>> frameChainMap = new HashMap<>();

    public ChromiumAccessibilityTree(Map<String, Object> cdpResponse) {
        this.cdpResponse = cdpResponse == null ? Map.of() : cdpResponse;
    }

    /** Factory that skips building by reusing a pre-computed XML string. */
    static ChromiumAccessibilityTree fromXml(String xml, Map<Integer, Object> frameMap) {
        ChromiumAccessibilityTree t = new ChromiumAccessibilityTree(Map.of());
        t.raw = xml == null ? "" : xml;
        if (frameMap != null) {
            t.frameMap.putAll(frameMap);
        }
        return t;
    }

    @Override
    public String toStr() {
        if (raw != null) return raw;

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) cdpResponse.getOrDefault("nodes", List.of());
        if (nodes.isEmpty()) {
            raw = "";
            return raw;
        }

        // Lookup: nodeId -> node.
        Map<String, Map<String, Object>> lookup = new LinkedHashMap<>();
        for (Map<String, Object> node : nodes) {
            Object id = node.get("nodeId");
            if (id != null) {
                lookup.put(id.toString(), node);
            }
        }

        // Inline iframe content: parent iframe backendNodeId -> list of root nodes.
        Map<Integer, List<Map<String, Object>>> iframeChildren = new HashMap<>();
        List<Map<String, Object>> trueRoots = new ArrayList<>();
        for (Map<String, Object> node : nodes) {
            if (node.get("parentId") == null) {
                Integer parentIframeId = toInteger(node.get("_parent_iframe_backend_node_id"));
                if (parentIframeId != null) {
                    iframeChildren.computeIfAbsent(parentIframeId, k -> new ArrayList<>()).add(node);
                } else {
                    trueRoots.add(node);
                }
            }
        }

        try {
            Document doc = newDocument();
            Element wrapper = doc.createElement("alumnium-root");
            for (Map<String, Object> node : trueRoots) {
                Element xml = nodeToXml(doc, node, lookup, iframeChildren);
                wrapper.appendChild(xml);
            }

            StringBuilder sb = new StringBuilder();
            NodeList kids = wrapper.getChildNodes();
            for (int i = 0; i < kids.getLength(); i++) {
                sb.append(serialize(kids.item(i)));
            }
            raw = sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Failed to render Chromium accessibility tree", e);
        }
        return raw;
    }

    private Element nodeToXml(Document doc,
                              Map<String, Object> node,
                              Map<String, Map<String, Object>> lookup,
                              Map<Integer, List<Map<String, Object>>> iframeChildren) {
        @SuppressWarnings("unchecked")
        Map<String, Object> role = (Map<String, Object>) node.get("role");
        String tag = role == null ? "unknown" : toStr(role.getOrDefault("value", "unknown"));
        Element elem = doc.createElement(sanitizeTag(tag));

        nextRawId++;
        elem.setAttribute("raw_id", Integer.toString(nextRawId));

        Object frame = node.get("_frame");
        if (frame != null) {
            frameMap.put(nextRawId, frame);
        }
        @SuppressWarnings("unchecked")
        List<Integer> chain = (List<Integer>) node.get("_frame_chain");
        if (chain != null) {
            frameChainMap.put(nextRawId, chain);
        }

        if (node.containsKey("backendDOMNodeId")) {
            elem.setAttribute("backendDOMNodeId", toStr(node.get("backendDOMNodeId")));
        }
        if (node.containsKey("nodeId")) {
            elem.setAttribute("nodeId", toStr(node.get("nodeId")));
        }
        if (node.containsKey("ignored")) {
            elem.setAttribute("ignored", toStr(node.get("ignored")));
        }
        if (Boolean.TRUE.equals(node.get("_playwright_node"))) {
            elem.setAttribute("_playwright_node", "true");
        }
        if (node.containsKey("_locator_info")) {
            try {
                elem.setAttribute("_locator_info", MAPPER.writeValueAsString(node.get("_locator_info")));
            } catch (Exception ignored) {
                // leave attribute absent
            }
        }
        if (node.containsKey("_frame_url")) {
            elem.setAttribute("_frame_url", toStr(node.get("_frame_url")));
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> name = (Map<String, Object>) node.get("name");
        if (name != null && name.containsKey("value")) {
            elem.setAttribute("name", toStr(name.get("value")));
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> properties = (List<Map<String, Object>>) node.get("properties");
        if (properties != null) {
            for (Map<String, Object> prop : properties) {
                String propName = toStr(prop.getOrDefault("name", ""));
                Object propValue = prop.get("value");
                if (propName.isEmpty()) continue;
                if (propValue instanceof Map<?, ?> propMap && propMap.containsKey("value")) {
                    elem.setAttribute(propName, toStr(propMap.get("value")));
                } else if (propValue instanceof Map<?, ?>) {
                    elem.setAttribute(propName, "");
                } else {
                    elem.setAttribute(propName, toStr(propValue));
                }
            }
        }

        @SuppressWarnings("unchecked")
        List<Object> childIds = (List<Object>) node.get("childIds");
        if (childIds != null) {
            for (Object childId : childIds) {
                Map<String, Object> child = lookup.get(toStr(childId));
                if (child != null) {
                    elem.appendChild(nodeToXml(doc, child, lookup, iframeChildren));
                }
            }
        }

        Integer backendNodeId = toInteger(node.get("backendDOMNodeId"));
        if (backendNodeId != null && iframeChildren.containsKey(backendNodeId)) {
            for (Map<String, Object> childRoot : iframeChildren.get(backendNodeId)) {
                elem.appendChild(nodeToXml(doc, childRoot, lookup, iframeChildren));
            }
        }
        return elem;
    }

    @Override
    public AccessibilityElement elementById(int rawId) {
        String xml = toStr();
        Document doc = parseWrapped(xml);
        Element match = findByRawId(doc.getDocumentElement(), Integer.toString(rawId));
        if (match == null) {
            throw new IllegalArgumentException("No element with raw_id=" + rawId + " found");
        }

        if ("true".equals(match.getAttribute("_playwright_node"))) {
            String frameUrl = match.getAttribute("_frame_url");
            if (frameUrl != null && !frameUrl.isEmpty()) {
                Map<String, Object> synthetic = new LinkedHashMap<>();
                synthetic.put("_synthetic_frame", true);
                synthetic.put("_frame_url", frameUrl);
                return new AccessibilityElement()
                    .type(match.getTagName())
                    .frame(frameMap.get(rawId))
                    .locatorInfo(synthetic);
            }

            String locatorStr = match.getAttribute("_locator_info");
            Map<String, Object> locator;
            if (locatorStr == null || locatorStr.isEmpty()) {
                locator = Map.of();
            } else {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsed = MAPPER.readValue(locatorStr, Map.class);
                    locator = parsed;
                } catch (Exception e) {
                    locator = Map.of();
                }
            }
            return new AccessibilityElement()
                .type(match.getTagName())
                .frame(frameMap.get(rawId))
                .locatorInfo(locator);
        }

        String backend = match.getAttribute("backendDOMNodeId");
        if (backend == null || backend.isEmpty()) {
            throw new IllegalStateException("Element with raw_id=" + rawId + " has no backendDOMNodeId attribute");
        }
        return new AccessibilityElement()
            .type(match.getTagName())
            .backendNodeId(Integer.parseInt(backend))
            .frame(frameMap.get(rawId))
            .frameChain(frameChainMap.get(rawId));
    }

    @Override
    public ChromiumAccessibilityTree scopeToArea(int rawId) {
        String xml = toStr();
        Document doc = parseWrapped(xml);
        Element match = findByRawId(doc.getDocumentElement(), Integer.toString(rawId));
        if (match == null) {
            return this;
        }
        return fromXml(serialize(match), frameMap);
    }

    // region helpers

    static Element findByRawId(Element root, String target) {
        if (target.equals(root.getAttribute("raw_id"))) {
            return root;
        }
        NodeList children = root.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child instanceof Element ce) {
                Element r = findByRawId(ce, target);
                if (r != null) return r;
            }
        }
        return null;
    }

    static Document parseWrapped(String xml) {
        try {
            DocumentBuilder b = newBuilder();
            return b.parse(new InputSource(new StringReader("<alumnium-root>" + xml + "</alumnium-root>")));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to parse accessibility XML", e);
        }
    }

    static Document newDocument() {
        try {
            return newBuilder().newDocument();
        } catch (Exception e) {
            throw new IllegalStateException("Failed to create XML document", e);
        }
    }

    static DocumentBuilder newBuilder() throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(false);
        f.setExpandEntityReferences(false);
        return f.newDocumentBuilder();
    }

    static String serialize(Node node) {
        try {
            TransformerFactory tf = TransformerFactory.newInstance();
            Transformer t = tf.newTransformer();
            t.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "yes");
            t.setOutputProperty(OutputKeys.INDENT, "yes");
            t.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2");
            StringWriter sw = new StringWriter();
            t.transform(new DOMSource(node), new StreamResult(sw));
            return sw.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialize XML node", e);
        }
    }

    private static String sanitizeTag(String tag) {
        if (tag == null || tag.isEmpty()) return "unknown";
        StringBuilder sb = new StringBuilder();
        char first = tag.charAt(0);
        sb.append(Character.isLetter(first) || first == '_' ? first : '_');
        for (int i = 1; i < tag.length(); i++) {
            char c = tag.charAt(i);
            sb.append(Character.isLetterOrDigit(c) || c == '-' || c == '_' || c == '.' ? c : '_');
        }
        return sb.toString();
    }

    private static String toStr(Object value) {
        if (value == null) return "";
        if (value instanceof Boolean b) return b ? "true" : "false";
        return value.toString();
    }

    private static Integer toInteger(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // endregion
}
