package ai.alumnium.system;

import static org.junit.jupiter.api.Assertions.assertTrue;

import ai.alumnium.tool.ScrollInDirectionTool;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium.*")
public class ScrollInDirectionTest extends BaseTest {

  static {
    extraTools = List.of(ScrollInDirectionTool.class);
  }

  private static int firstVisibleMessage() {
    Object value = al.get("number of the first visible message");
    Matcher match = Pattern.compile("\\d+").matcher(String.valueOf(value));
    assertTrue(match.find(), "No message number in " + value);
    return Integer.parseInt(match.group());
  }

  @Test
  void testScrollListUpAndDown() {
    navigate("scrollable_list.html");
    int initial = firstVisibleMessage();
    al.act("scroll up the messages");
    int scrolledUp = firstVisibleMessage();
    assertTrue(scrolledUp < initial, scrolledUp + " should be less than " + initial);
    al.act("scroll down the messages");
    int scrolledDown = firstVisibleMessage();
    assertTrue(scrolledDown > scrolledUp, scrolledDown + " should be greater than " + scrolledUp);
  }

  @Test
  void testScrollListInsideFrame() {
    navigate("scrollable_list_frame.html");
    int initial = firstVisibleMessage();
    al.act("scroll up the messages");
    int scrolledUp = firstVisibleMessage();
    assertTrue(scrolledUp < initial, scrolledUp + " should be less than " + initial);
  }
}
