package ai.alumnium.accessibility;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.TextNode;

/**
 * HTML page source from an Appium WEBVIEW context rendered with stable {@code raw_id} identifiers.
 */
public final class WebViewAccessibilityTree extends BaseAccessibilityTree {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final List<String> SKIP_TAGS =
      List.of("head", "script", "style", "meta", "link", "title", "noscript");

  private final String html;
  private int nextRawId = 0;
  private String raw;

  public WebViewAccessibilityTree(String html) {
    this.html = html == null ? "" : html;
  }

  private WebViewAccessibilityTree(String rawXml, @SuppressWarnings("unused") boolean prebuilt) {
    this.html = "";
    this.raw = rawXml;
  }

  @Override
  public String toStr() {
    if (raw != null) return raw;
    Document jsoupDoc = Jsoup.parse(html);
    Element htmlEl = jsoupDoc.selectFirst("html");
    if (htmlEl == null) {
      raw = "";
      return raw;
    }
    org.w3c.dom.Document xmlDoc = ChromiumAccessibilityTree.newDocument();
    xmlDoc.appendChild(buildXmlElement(xmlDoc, htmlEl));
    raw = ChromiumAccessibilityTree.serialize(xmlDoc.getDocumentElement());
    return raw;
  }

  private org.w3c.dom.Element buildXmlElement(org.w3c.dom.Document doc, Element jsoupEl) {
    String tag = jsoupEl.tagName().toLowerCase();
    org.w3c.dom.Element xmlEl = doc.createElement(tag);

    nextRawId++;
    xmlEl.setAttribute("raw_id", Integer.toString(nextRawId));

    String htmlId = jsoupEl.id();
    if (!htmlId.isEmpty()) {
      xmlEl.setAttribute("resource-id", htmlId);
    }

    String text = jsoupEl.text();
    if (!text.isEmpty()) {
      xmlEl.setAttribute("name", text);
      xmlEl.setAttribute("text", text);
    }

    String draggable = jsoupEl.attr("draggable");
    if ("true".equalsIgnoreCase(draggable)) {
      xmlEl.setAttribute("draggable", "true");
    }

    // Expose live form-element value injected by WebViewAppiumViewStrategy.accessibilityTree()
    String liveValue = jsoupEl.attr("data-al-live-value");
    if (!liveValue.isEmpty()) {
      xmlEl.setAttribute("value", liveValue);
      if (text.isEmpty()) {
        xmlEl.setAttribute("name", liveValue);
        xmlEl.setAttribute("text", liveValue);
      }
    }

    try {
      Map<String, Object> locator = new LinkedHashMap<>();
      locator.put("selector", computeSelector(jsoupEl));
      locator.put("nth", 0);
      xmlEl.setAttribute("_locator_info", MAPPER.writeValueAsString(locator));
    } catch (Exception ignored) {
    }

    for (org.jsoup.nodes.Node child : jsoupEl.childNodes()) {
      if (child instanceof Element childEl) {
        if (!SKIP_TAGS.contains(childEl.tagName().toLowerCase())) {
          xmlEl.appendChild(buildXmlElement(doc, childEl));
        }
      } else if (child instanceof TextNode textNode) {
        String t = textNode.text().trim();
        if (!t.isEmpty()) {
          xmlEl.appendChild(doc.createTextNode(t));
        }
      }
    }

    return xmlEl;
  }

  private static String computeSelector(Element el) {
    String id = el.id();
    if (!id.isEmpty()) {
      // CSS id-selectors starting with a digit are invalid; use attribute selector instead
      if (Character.isDigit(id.charAt(0))) {
        return "[id=\"" + id.replace("\\", "\\\\").replace("\"", "\\\"") + "\"]";
      }
      return "#" + id;
    }

    String tag = el.tagName().toLowerCase();
    if (tag.equals("html")) return "html";

    Element parent = el.parent();
    if (parent == null || parent.tagName().equals("#root")) return tag;

    String parentSelector = computeSelector(parent);
    int nth = 0;
    for (Element sibling : parent.children()) {
      if (sibling.tagName().equalsIgnoreCase(tag)) {
        nth++;
        if (sibling == el) break;
      }
    }
    return parentSelector + " > " + tag + ":nth-of-type(" + nth + ")";
  }

  @Override
  public AccessibilityElement elementById(int rawId) {
    String xml = toStr();
    org.w3c.dom.Document doc = ChromiumAccessibilityTree.parseWrapped(xml);
    org.w3c.dom.Element match =
        ChromiumAccessibilityTree.findByRawId(doc.getDocumentElement(), Integer.toString(rawId));
    if (match == null) {
      throw new IllegalArgumentException("No element with raw_id=" + rawId + " found");
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
    return new AccessibilityElement().id(rawId).type(match.getTagName()).locatorInfo(locator);
  }

  @Override
  public WebViewAccessibilityTree scopeToArea(int rawId) {
    String xml = toStr();
    org.w3c.dom.Document doc = ChromiumAccessibilityTree.parseWrapped(xml);
    org.w3c.dom.Element match =
        ChromiumAccessibilityTree.findByRawId(doc.getDocumentElement(), Integer.toString(rawId));
    if (match == null) return this;
    return new WebViewAccessibilityTree(ChromiumAccessibilityTree.serialize(match), true);
  }
}
