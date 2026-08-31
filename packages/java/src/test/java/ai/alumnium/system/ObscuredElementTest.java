package ai.alumnium.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium.*")
public class ObscuredElementTest extends BaseTest {

  private static final String OBSCURED_ELEMENT_URL =
      new File("../python/examples/support/pages/obscured_element.html").toURI().toString();

  @Test
  void testClickElementCoveredByStickyBar() {
    navigate(OBSCURED_ELEMENT_URL);
    al.act("click the 'Click Me' button");
    assertThat(al.get("status message")).asString().contains("button clicked");
  }
}
