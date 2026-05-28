package ai.alumnium.system;

import ai.alumnium.Alumni;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assumptions.assumeFalse;

public class DragAndDropTest extends BaseTest {

  private static final String DRAG_AND_DROP_URL =
      "https://the-internet.herokuapp.com/drag_and_drop";

  @Test
  void testDragAndDrop() {
    assumeFalse(
        IS_APPIUM,
        "Example doesn't support drag and drop in mobile browsers");
    navigate(DRAG_AND_DROP_URL);
    Object data =
        al.get(
            "titles of squares ordered from left to right",
            new Alumni.GetOptions().withVision(true));
    Assertions.assertEquals(List.of("A", "B"), listFromGet(data));

    al.act("move square A to square B");

    data =
        al.get(
            "titles of squares ordered from left to right",
            new Alumni.GetOptions().withVision(true));
    Assertions.assertEquals(List.of("B", "A"), listFromGet(data));
  }

  @AfterAll
  static void tearDown() {
    al.close();
  }

  private static List<String> listFromGet(Object data) {
    Assertions.assertInstanceOf(
        List.class, data, () -> "expected list result, got: " + (data == null ? "null" : data));
    List<?> items = (List<?>) data;
    return items.stream().map(String::valueOf).toList();
  }
}
