package ai.alumnium.system;

import java.io.File;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium.*")
public class ShadowDomTest extends BaseTest {

  private static final String SHADOW_DOM_URL =
      new File("../python/examples/support/pages/shadow_dom.html").toURI().toString();

  @Test
  void testShadowDom() {
    navigate(SHADOW_DOM_URL);

    String pageText = (String) al.get("page text string");
    Assertions.assertTrue(pageText.contains("This is inside Shadow DOM!"));
    Assertions.assertTrue(pageText.contains("This is another text inside Shadow DOM!"));

    al.act("click first shadow button");
    pageText = (String) al.get("page text string");
    Assertions.assertTrue(pageText.contains("Shadow Button 1 was clicked!"));
    Assertions.assertFalse(pageText.contains("This is inside Shadow DOM!"));

    al.act("click second shadow button");
    pageText = (String) al.get("page text string");
    Assertions.assertTrue(pageText.contains("Shadow Button 2 was clicked!"));
    Assertions.assertFalse(pageText.contains("This is another text inside Shadow DOM!"));
  }
}
