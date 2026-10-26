package ai.alumnium.unit.accessibility;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.alumnium.accessibility.AriaAccessibilityTree;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AriaAccessibilityTreeTest {

  @Test
  void rendersSnapshotWithRawIdsAndSharedIds() {
    assertThat(todoTree().toStr())
        .isEqualTo(
            """
            <RootWebArea raw_id="1">
              <heading level="1" name="todos" raw_id="2" sharedId="shared-1"/>
              <textbox name="What needs to be done?" placeholder="What needs to be done?" raw_id="3" sharedId="shared-2"/>
              <list raw_id="4" sharedId="shared-3">
                <listitem raw_id="5" sharedId="shared-4">
                  <checkbox checked="false" raw_id="6" sharedId="shared-5"/>
                  <text name="buy milk" raw_id="7"/>
                  <button name="×" raw_id="8" sharedId="shared-6"/>
                </listitem>
              </list>
              <text name="0 items left" raw_id="9"/>
            </RootWebArea>""");
  }

  @Test
  void findsElementsByRawId() {
    var element = todoTree().elementById(8);

    assertThat(element.type()).isEqualTo("button");
    assertThat(element.sharedId()).isEqualTo("shared-6");
  }

  @Test
  void failsToFindElementsWithoutSharedId() {
    AriaAccessibilityTree tree = todoTree();

    assertThatThrownBy(() -> tree.elementById(7))
        .hasMessage("Element with raw_id=7 has no sharedId attribute");
    assertThatThrownBy(() -> tree.elementById(100)).hasMessage("No element with raw_id=100 found");
  }

  @Test
  void scopesToAreaKeepingRawIdsAndSharedIds() {
    AriaAccessibilityTree area = todoTree().scopeToArea(5);

    assertThat(area.toStr())
        .isEqualTo(
            """
            <listitem raw_id="5" sharedId="shared-4">
              <checkbox checked="false" raw_id="6" sharedId="shared-5"/>
              <text name="buy milk" raw_id="7"/>
              <button name="×" raw_id="8" sharedId="shared-6"/>
            </listitem>""");
    assertThat(area.elementById(6).sharedId()).isEqualTo("shared-5");
  }

  @Test
  void rendersValuesTheSnapshotLeavesOut() {
    AriaAccessibilityTree tree =
        new AriaAccessibilityTree(
            Map.of(
                "role",
                "fragment",
                "name",
                "",
                "children",
                List.of(node("button", "Choose File", "e1", Map.of()))),
            Map.of("e1", "shared-1"),
            Map.of("e1", "report.txt"));

    assertThat(tree.toStr())
        .contains(
            "<button name=\"Choose File\" raw_id=\"2\" sharedId=\"shared-1\""
                + " value=\"report.txt\"/>");
  }

  /** ARIA snapshot of a TodoMVC page taken by acquiescence in Firefox. */
  private static AriaAccessibilityTree todoTree() {
    Map<String, Object> listItem =
        node(
            "listitem",
            "",
            "e4",
            Map.of(
                "children",
                List.of(
                    node("checkbox", "", "e5", Map.of("checked", false)),
                    "buy milk",
                    node("button", "×", "e6", Map.of()))));
    Map<String, Object> root =
        Map.of(
            "role",
            "fragment",
            "name",
            "",
            "children",
            List.of(
                node("heading", "todos", "e1", Map.of("level", 1)),
                node(
                    "textbox",
                    "What needs to be done?",
                    "e2",
                    Map.of("placeholder", "What needs to be done?")),
                node("list", "", "e3", Map.of("children", List.of(listItem))),
                "0 items left"));
    Map<String, String> sharedIds =
        Map.of(
            "e1", "shared-1",
            "e2", "shared-2",
            "e3", "shared-3",
            "e4", "shared-4",
            "e5", "shared-5",
            "e6", "shared-6");
    return new AriaAccessibilityTree(root, sharedIds, null);
  }

  private static Map<String, Object> node(
      String role, String name, String ref, Map<String, Object> extra) {
    Map<String, Object> node = new java.util.HashMap<>(extra);
    node.put("role", role);
    node.put("name", name);
    node.put("ref", ref);
    node.putIfAbsent("children", List.of());
    return node;
  }
}
