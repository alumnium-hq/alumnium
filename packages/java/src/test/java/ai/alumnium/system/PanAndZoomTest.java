package ai.alumnium.system;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ai.alumnium.tool.ExecuteJavascriptTool;
import ai.alumnium.tool.PanInDirectionTool;
import ai.alumnium.tool.ZoomTool;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium.*")
public class PanAndZoomTest extends BaseTest {

  static {
    extraTools = List.of(ExecuteJavascriptTool.class, PanInDirectionTool.class, ZoomTool.class);
  }

  private static int number(String what) {
    Object value = al.get(what);
    Matcher match = Pattern.compile("-?\\d+").matcher(String.valueOf(value));
    assertTrue(match.find(), "No number in " + value);
    return Integer.parseInt(match.group());
  }

  @Test
  void testPanMapInEachDirection() {
    navigate("pannable_map.html");
    assertEquals(0, number("east value of the map center"));
    al.act("pan the map left");
    int east = number("east value of the map center");
    assertTrue(east < 0, east + " should be less than 0");
    al.act("pan the map right");
    assertEquals(0, number("east value of the map center"));
    al.act("pan the map up");
    int north = number("north value of the map center");
    assertTrue(north > 0, north + " should be greater than 0");
  }

  @Test
  void testPanMapWhenAskedToDragIt() {
    navigate("pannable_map.html");
    al.act("drag the map about 100 pixels to the right");
    int east = number("east value of the map center");
    assertTrue(east < 0, east + " should be less than 0");
  }

  @Test
  void testZoomMapInAndOut() {
    navigate("pannable_map.html");
    al.act("zoom in the map");
    assertEquals(11, number("zoom level of the map"));
    al.act("zoom out the map");
    al.act("zoom out the map");
    assertEquals(9, number("zoom level of the map"));
  }
}
