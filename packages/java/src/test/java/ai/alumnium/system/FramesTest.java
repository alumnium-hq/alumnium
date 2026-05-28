package ai.alumnium.system;

import static org.junit.jupiter.api.Assumptions.assumeFalse;

import java.io.File;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

public class FramesTest extends BaseTest {

  private static final String CROSS_ORIGIN_IFRAME_URL =
      new File("../python/examples/support/pages/cross_origin_iframe.html").toURI().toString();

  @Test
  void testNestedFrames() {
    assumeFalse(
        IS_APPIUM, "Frames support is only implemented for Playwright and Selenium currently");
    navigate("https://the-internet.herokuapp.com/nested_frames");

    al.act("click MIDDLE text");
    Assertions.assertEquals(
        List.of("LEFT", "MIDDLE", "RIGHT", "BOTTOM"), al.get("text from all frames"));
  }

  @Test
  void testCrossOriginIframe() {
    assumeFalse(
        IS_APPIUM, "Frames support is only implemented for Playwright and Selenium currently");
    navigate(CROSS_ORIGIN_IFRAME_URL);

    al.check("button 'Main Page Button' is present");
    al.act("click button 'Click Me Inside Iframe'");
    al.check("text 'Button Clicked!' is present");
    al.act("click link 'Iframe Link'");
    al.check("text 'Link Clicked!' is present");
  }
}
