package ai.alumnium.system;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium.*")
public class ObscuredElementTest extends BaseTest {

  private static final String OBSCURED_ELEMENT_URL = "obscured_element.html";

  @Test
  void testClickElementCoveredByStickyBar() {
    navigate(OBSCURED_ELEMENT_URL);
    al.act("click the 'Click Me' button");
    assertThat(al.get("status message")).asString().contains("button clicked");
  }
}
