package ai.alumnium.integration;

import ai.alumnium.Alumni;
import ai.alumnium.client.Data;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

public class DragAndDropTest extends BaseTest {

  private static final String DRAG_AND_DROP_URL =
      "https://the-internet.herokuapp.com/drag_and_drop";

  @Test
  void testDragAndDrop() {
    driver.get(DRAG_AND_DROP_URL);
    Data data =
        al.get("titles of squares ordered from left to right", new Alumni.VisionOptions(true));
    Assertions.assertEquals(List.of("A", "B"), listFromGet(data));

    al.act("move square A to square B");

    data = al.get("titles of squares ordered from left to right", new Alumni.VisionOptions(true));
    Assertions.assertEquals(List.of("B", "A"), listFromGet(data));
  }

  @AfterAll
  static void tearDown() {
    al.close();
  }

  private static List<String> listFromGet(Data data) {
    Object raw = data.toObject();
    Assertions.assertInstanceOf(
        List.class, raw, () -> "expected list result, got: " + (raw == null ? "null" : raw));
    List<?> items = (List<?>) raw;
    return items.stream().map(String::valueOf).toList();
  }
}
