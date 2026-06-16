package ai.alumnium.system;

import ai.alumnium.Alumni;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium.*")
public class DragAndDropTest extends BaseTest {

  private static final String DRAG_AND_DROP_URL =
      "https://the-internet.herokuapp.com/drag_and_drop";

  @Test
  void testDragAndDrop() {
    navigate(DRAG_AND_DROP_URL);
    Object data =
        al.get(
            "titles of squares ordered from left to right",
            new Alumni.GetOptions().withVision(true));
    Assertions.assertEquals(List.of("A", "B"), data);

    al.act("move square A to square B");

    data =
        al.get(
            "titles of squares ordered from left to right",
            new Alumni.GetOptions().withVision(true));
    Assertions.assertEquals(List.of("B", "A"), data);
  }

  @AfterAll
  static void tearDown() {
    al.close();
  }
}
