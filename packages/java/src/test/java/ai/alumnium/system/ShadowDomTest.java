package ai.alumnium.system;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium.*")
public class ShadowDomTest extends BaseTest {

  private static final String SHADOW_DOM_URL = "shadow_dom.html";

  @Test
  void testShadowDom() {
    navigate(SHADOW_DOM_URL);

    Object pageText = al.get("page text");
    assertThat(pageText)
        .asString()
        .contains("This is inside Shadow DOM!", "This is another text inside Shadow DOM!");

    al.act("click first shadow button");
    pageText = al.get("page text");
    assertThat(pageText)
        .asString()
        .contains("Shadow Button 1 was clicked!")
        .doesNotContain("This is inside Shadow DOM!");

    al.act("click second shadow button");
    pageText = al.get("page text");
    assertThat(pageText)
        .asString()
        .contains("Shadow Button 2 was clicked!")
        .doesNotContain("This is another text inside Shadow DOM!");
  }
}
