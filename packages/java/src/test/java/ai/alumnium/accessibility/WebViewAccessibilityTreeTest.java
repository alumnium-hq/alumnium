package ai.alumnium.accessibility;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class WebViewAccessibilityTreeTest {

  @Test
  void storesIdSelectorWhenPresent() {
    String html =
        "<html><body>"
            + "<div id=\"column-a\">A</div>"
            + "<div id=\"column-b\">B</div>"
            + "</body></html>";
    var tree = new WebViewAccessibilityTree(html);

    // XML attribute values encode JSON quotes as &quot; — check raw selector substring instead
    String xml = tree.toStr();
    assertThat(xml).contains("#column-a");
    assertThat(xml).contains("#column-b");

    // elementById decodes the locatorInfo back to a plain Map
    AccessibilityElement elA = tree.elementById(3);
    assertThat(elA.locatorInfo()).containsEntry("selector", "#column-a");

    AccessibilityElement elB = tree.elementById(4);
    assertThat(elB.locatorInfo()).containsEntry("selector", "#column-b");
  }

  @Test
  void assignsSequentialRawIds() {
    String html = "<html><body><p>Hello</p></body></html>";
    var tree = new WebViewAccessibilityTree(html);
    String xml = tree.toStr();

    assertThat(xml).contains("raw_id=\"1\"");
    assertThat(xml).contains("raw_id=\"2\"");
    assertThat(xml).contains("raw_id=\"3\"");
  }

  @Test
  void scopeToAreaNarrowsTree() {
    String html =
        "<html><body>" + "<div id=\"root\"><span id=\"child\">text</span></div>" + "</body></html>";
    var tree = new WebViewAccessibilityTree(html);
    // raw_id=3 is the #root div; scoping should exclude html/body from result
    var scoped = tree.scopeToArea(3);
    String xml = scoped.toStr();
    assertThat(xml).contains("#root");
    assertThat(xml).doesNotContain("raw_id=\"1\"");
  }

  @Test
  void buildsNthOfTypeForElementsWithoutId() {
    String html = "<html><body><p>one</p><p>two</p></body></html>";
    var tree = new WebViewAccessibilityTree(html);
    String xml = tree.toStr();
    assertThat(xml).contains("nth-of-type(1)");
    assertThat(xml).contains("nth-of-type(2)");
  }

  @Test
  void skipsHeadAndScriptElements() {
    String html =
        "<html><head><title>T</title><script>alert(1)</script></head>"
            + "<body><p>visible</p></body></html>";
    var tree = new WebViewAccessibilityTree(html);
    String xml = tree.toStr();
    assertThat(xml).doesNotContain("<head");
    assertThat(xml).doesNotContain("<script");
    assertThat(xml).doesNotContain("<title");
    assertThat(xml).contains("visible");
  }
}
