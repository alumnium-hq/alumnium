package ai.alumnium.unit.accessibility;

import static org.assertj.core.api.Assertions.assertThat;

import ai.alumnium.accessibility.ChromiumAccessibilityTree;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ChromiumAccessibilityTreeTest {

  @Test
  void rendersNodeValueAsAttribute() {
    Map<String, Object> node =
        Map.of(
            "nodeId", "1",
            "role", Map.of("value", "combobox"),
            "value", Map.of("value", "Option 2"));

    String xml = new ChromiumAccessibilityTree(Map.of("nodes", List.of(node))).toStr();

    assertThat(xml).contains("value=\"Option 2\"");
  }

  @Test
  void preservesUncheckedState() {
    Map<String, Object> node =
        Map.of(
            "nodeId",
            "1",
            "backendDOMNodeId",
            1,
            "role",
            Map.of("value", "checkbox"),
            "properties",
            List.of(Map.of("name", "checked", "value", Map.of("value", "false"))));
    ChromiumAccessibilityTree tree = new ChromiumAccessibilityTree(Map.of("nodes", List.of(node)));

    assertThat(tree.toStr()).contains("checked=\"false\"");
    assertThat(tree.scopeToArea(1).toStr()).contains("checked=\"false\"");
  }

  @Test
  void scopeToAreaPreservesFrameChain() {
    Map<String, Object> form =
        Map.of(
            "nodeId", "1",
            "backendDOMNodeId", 1,
            "role", Map.of("value", "form"),
            "childIds", List.of("2"),
            "_frame_chain", List.of(10));
    Map<String, Object> button =
        Map.of(
            "nodeId",
            "2",
            "backendDOMNodeId",
            2,
            "role",
            Map.of("value", "button"),
            "_frame_chain",
            List.of(10));
    ChromiumAccessibilityTree tree =
        new ChromiumAccessibilityTree(Map.of("nodes", List.of(form, button)));

    assertThat(tree.scopeToArea(1).elementById(2).frameChain()).containsExactly(10);
  }
}
