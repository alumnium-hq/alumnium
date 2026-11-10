package ai.alumnium.system;

import ai.alumnium.tool.DragSliderTool;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium.*")
public class DragSliderTest extends BaseTest {

  static {
    extraTools = List.of(DragSliderTool.class);
  }

  @Test
  void testDragSlider() {
    navigate("slider.html");

    al.act("drag the slider to 70");
    al.check("the slider value is 70");

    al.act("drag the slider to 33");
    al.check("the slider value is 33");
  }

  @Test
  void testDragAriaSlider() {
    navigate("aria_slider.html");

    al.act("drag the distance slider to 70");
    al.check("the distance is 70 miles");

    al.act("drag the distance slider to 30");
    al.check("the distance is 30 miles");
  }

  @Test
  void testDragControlledSlider() {
    navigate("controlled_slider.html");

    al.act("drag the storage slider to 20");
    al.check("the storage is 20 TB");
  }

  @Test
  void testDragRangeSlider() {
    navigate("range_slider.html");

    al.act("drag the maximum price slider to 20");
    al.check("the price is $0 – $20");

    al.act("drag the minimum price slider to 15");
    al.check("the price is $15 – $20");
  }
}
