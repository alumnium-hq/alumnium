package ai.alumnium.unit.accessibility;

import static org.assertj.core.api.Assertions.assertThat;

import ai.alumnium.accessibility.XCUITestAccessibilityTree;
import org.junit.jupiter.api.Test;

class XCUITestAccessibilityTreeTest {

  @Test
  void tracksIndexAmongElementsMatchingSamePredicate() {
    XCUITestAccessibilityTree tree = duplicateElementsTree();

    assertThat(tree.elementById(2).index()).isEqualTo(0);
    assertThat(tree.elementById(5).index()).isEqualTo(1);
    assertThat(tree.elementById(7).index()).isEqualTo(2);
  }

  @Test
  void scopeToAreaPreservesFullTreeIdsAndIndexes() {
    XCUITestAccessibilityTree area = duplicateElementsTree().scopeToArea(4);

    assertThat(area.toStr()).contains("raw_id=\"7\"");
    assertThat(area.elementById(7).index()).isEqualTo(2);
  }

  private static XCUITestAccessibilityTree duplicateElementsTree() {
    return new XCUITestAccessibilityTree(
        """
        <XCUIElementTypeApplication>
          <XCUIElementTypeButton name="Action" label="Action">
            <XCUIElementTypeStaticText name="First"/>
          </XCUIElementTypeButton>
          <XCUIElementTypeOther name="Area">
            <XCUIElementTypeButton name="Action" label="Action">
              <XCUIElementTypeStaticText name="Second"/>
            </XCUIElementTypeButton>
            <XCUIElementTypeButton name="Action" label="Action">
              <XCUIElementTypeStaticText name="Third"/>
            </XCUIElementTypeButton>
          </XCUIElementTypeOther>
        </XCUIElementTypeApplication>""");
  }
}
