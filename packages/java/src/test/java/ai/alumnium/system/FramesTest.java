package ai.alumnium.system;

import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium.*")
public class FramesTest extends BaseTest {

  private static final String CROSS_ORIGIN_IFRAME_URL = "cross_origin_iframe.html";

  @Test
  void testNestedFrames() {
    navigate("the-internet/nested-frames.html");

    al.act("click MIDDLE text");
    Assertions.assertEquals(
        List.of("LEFT", "MIDDLE", "RIGHT", "BOTTOM"), al.get("text from all frames"));
  }

  @DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "selenium")
  @Test
  void testCrossOriginIframe() {
    navigate(CROSS_ORIGIN_IFRAME_URL);

    al.check("button 'Main Page Button' is present");
    al.check("'Password' field is present");
    al.act("type 'testuser' in the text input field");
    al.check("Text input contains 'testuser'");
    al.act("click Submit button");
    al.check("'Form submitted' message is present");
  }
}
