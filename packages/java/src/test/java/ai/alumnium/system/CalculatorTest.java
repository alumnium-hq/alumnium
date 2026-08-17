package ai.alumnium.system;

import ai.alumnium.Provider;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

public class CalculatorTest extends BaseTest {

  private static final String CALCULATOR_URL = "https://seleniumbase.io/apps/calculator";

  @BeforeAll
  static void learn() {
    if (al.model().provider() == Provider.MISTRALAI) {
      al.learn(
          "4 / 2 =",
          List.of("click button '4'", "click button '÷'", "click button '2'", "click button '='"));
    }
  }

  @Test
  void testAddition() {
    navigate(CALCULATOR_URL);
    al.act("2 + 2 =");
    Assertions.assertEquals(4L, al.get("calculator result from textfield"));
  }

  @Test
  void testSubtraction() {
    navigate(CALCULATOR_URL);
    al.act("5 - 3 =");
    Assertions.assertEquals(2L, al.get("calculator result from textfield"));
  }

  @Test
  void testMultiplication() {
    navigate(CALCULATOR_URL);
    al.act("3 * 4 =");
    Assertions.assertEquals(12L, al.get("calculator result from textfield"));
  }

  @Test
  void testDivision() {
    navigate(CALCULATOR_URL);
    al.act("8 / 2 =");
    Assertions.assertEquals(4L, al.get("calculator result from textfield"));
  }
}
